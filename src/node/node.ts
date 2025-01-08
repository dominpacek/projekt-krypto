// deno-lint-ignore-file no-explicit-any
import { Application } from "jsr:@oak/oak/application";
import { Router } from "jsr:@oak/oak/router";
import { Block } from "../blockchain/block.ts";
import { Transaction } from "../blockchain/transaction.ts";
import { Blockchain } from "../blockchain/blockchain.ts";
import { GenericMessage } from "./genericMessage.ts";


export class Node {
  address: string;
  port: number;

  peers: string[] = []; // List of peer URLs
  knownMessages: string[] = []; // Remember received messages

  blockchain!: Blockchain;
  localFilesPath: string;

  constructor(address: string, port: number, file_path: string) {
    this.address = address;
    this.port = port;
    this.localFilesPath = file_path;

    this.runHttpServer();
    console.log(`💎 Listening on ${this.getUrl()}`);
  }

  getUrl() {
    return `http://${this.address}:${this.port}`;
  }

  // Mines a block and sends it to peers
  mineBlock(rewardAddress: string) {
    const newBlock = this.blockchain.mineBlock(rewardAddress);
    this.addBlock(newBlock);
    this.broadcastBlock(newBlock);
  }

  addBlock(newBlock: Block) {
    this.blockchain.blocks.push(newBlock);
    this.blockchain.saveBlockChain(this.localFilesPath);
  }

  // Sends a test message to a target URL
  public sayHi(url: string) {
    const message = new GenericMessage(`Hi from ${this.getUrl()}!`);
    console.log(`➡️: Sending message "${message.token}" to ${url}`);
    this.knownMessages.push(message.token);
    this.send(message, url);
  }

  // Broadcasts a message to all known peers
  async broadcast(
    message: GenericMessage,
    endpoint: string = "/node/add_message",
  ) {
    this.knownMessages.push(message.token);
    console.log(
      `➡️: Broadcasting ${message.token} to ${this.peers.length} peers.`,
    );
    await Promise.all(this.peers.map(async (peer) => {
      await this.send(message, peer, endpoint); // Run all `send` calls concurrently
    }));
  }

  // Sends a message to a target URL, used by broadcast()
  async send(
    message: GenericMessage,
    target_url: string,
    endpoint: string = "/node/add_message",
  ) {
    const req = new Request(target_url + endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(message),
    });
    const _resp = await fetch(req);
    // console.log("response: ", resp);
  }

  public addPeer(url: string, greet?: boolean) {
    this.peers.push(url);
    if (greet) {
      this.greetPeer(url);
    }
  }

  // Ask peer to add us to their list of peers
  async greetPeer(peer: string) {
    const req = new Request(peer + "/node/add_peer", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ address: this.getUrl() }),
    });
    const _resp = await fetch(req);
  }

  async askForBlockchain() {
    // Ask all peers for their blockchains, choose the longest valid one
    let longestBlockchain: Blockchain | null = null;

    console.log(`Asking peers for blockchain`);
    for (const peer of this.peers) {
      try {
        const req = new Request(peer + "/blockchain", {
          method: "GET",
        });

        const response = await fetch(req);
        const obj = await response.json();

        const receivedBlockchain = Blockchain.fromJson(JSON.stringify(obj));

        if (
          !longestBlockchain ||
          receivedBlockchain.blocks.length > longestBlockchain.blocks.length
        ) {
          longestBlockchain = receivedBlockchain;
        }
      } catch (error) {
        console.error(`Error fetching blockchain from ${peer}:`, error);
      }
    }
    //

    if (longestBlockchain) {
      this.blockchain = longestBlockchain;
      console.log(
        `Fetched blockchain ${this.blockchain.blocks.length} blocks long.`,
      );
    } else {
      console.log("No valid blockchain received from peers.");
    }
  }

  static async askForBlockchainFromPeer(peer: string) {
    try {
      const req = new Request(peer + "/blockchain", {
        method: "GET",
      });

      const response = await fetch(req);
      const obj = await response.json();

      return Blockchain.fromJson(JSON.stringify(obj));
    } catch (error) {
      console.error(`Error fetching blockchain from ${peer}:`, error);
    }
  }

  public broadcastBlock(block: Block) {
    const message = new GenericMessage(JSON.stringify(block));
    console.log(`📡: Broadcasting mined block index=${block.index}`);
    this.knownMessages.push(message.token);
    this.broadcast(message, "/blockchain/add_block");
  }

  async runHttpServer() {
    const router = new Router();
    router
      .get("/", (context) => {
        context.response.body = "Hello world!";
      })
      .get("/node", (context) => { // todo sprwadzić czy można to wywalić
        context.response.body = `Dzień dobry od node ${this.getUrl()}`;
      })
      .post("/node/add_peer", (context) => {
        this.handleAddPeer(context);
      })
      .post("/node/add_message", (context) => {
        this.handleAddMessage(context);
      })
      .get("/blockchain", (context) => {
        context.response.body = JSON.stringify(this.blockchain);
        context.response.type = "application/json";
      })
      .post("/blockchain/add_block", (context) => {
        this.handleAddBlock(context);
      })
      .get("/transactions/balance", (context) => {
        this.handleGetBalance(context);
      })
      .post("/transactions", (context) => {
        // this.handleAddTransaction(context);
      });

    const app = new Application();
    app.use(router.routes());
    app.use(router.allowedMethods());

    await app.listen({ port: this.port });
  }

  // async handleRequest(context: any, callback: Function) {
  //   // Function 
  //   try {
  //     const body = context.request.body;
  //     if (body.type() !== "json") {
  //       context.response.status = 400;
  //       context.response.body = {
  //         message: "Unsupported content type",
  //       };
  //       return;
  //     }

  //     const req = await body.json();
  //     const address = req.address as string;
  //     const balance = this.blockchain.getBalance(address);

  //     context.response.body = { balance: balance };
  //     context.response.status = 200;

  //   } catch (error) {
  //     console.error("Error handling request:", error);
  //     context.response.status = 500;
  //     context.response.body = {
  //       message: "Internal Server Error",
  //     };
  //   }
  // }

  async handleAddMessage(context: any) {
    try {
      const body = context.request.body;
      if (body.type() === "json") {
        const req = await body.json();
        const mess = req as GenericMessage;
        context.response.status = 200;
        context.response.body = { message: "response!" };
        // console.log("Json content", x);
        if (!this.knownMessages.includes(mess.token)) {
          console.log(`📥 Received new message`, mess);
          this.broadcast(mess);
        } else {
          // Message was already received, don't broadcast
          console.log(
            `📥 %cReceived message ${mess.token} again. No rebroadcast.`,
            "color: gray",
          );
        }
      } else {
        context.response.status = 400;
        context.response.body = {
          message: "Unsupported content type",
        };
      }
    } catch (error) {
      console.error("Error handling request:", error);
      context.response.status = 500;
      context.response.body = {
        message: "Internal Server Error",
      };
    }
  }

  async handleAddPeer(context: any) {
    try {
      const body = context.request.body;
      if (body.type() === "json") {
        const req = await body.json();
        const peer_address = req.address as string;
        // console.log("Json content", x);
        if (!this.peers.includes(peer_address)) {
          console.log(
            `📳 %cAdding new peer at ${peer_address}.`,
            "color: orange",
          );
          this.addPeer(peer_address);
        } else {
          console.log(
            `📳 Already have peer ${peer_address}.`,
          );
        }
      } else {
        context.response.status = 400;
        context.response.body = {
          message: "Unsupported content type",
        };
      }
    } catch (error) {
      console.error("Error handling request:", error);
      context.response.status = 500;
      context.response.body = {
        message: "Internal Server Error",
      };
    }
  }

  async handleAddBlock(context: any) {
    try {
      const body = context.request.body;
      if (body.type() === "json") {
        const req = await body.json();
        const mess = req as GenericMessage;
        if (this.knownMessages.includes(mess.token)) {
          return;
        }
        this.broadcast(mess, "/blockchain/add_block");

        const receivedBlock = Block.fromJson(JSON.parse(mess.content));
        // Sprawdź czy indeks nowego bloku jest o 1 wyższy od ostatniego posiadanego
        const nextIndex =
          this.blockchain.blocks[this.blockchain.blocks.length - 1].index + 1;
        if (nextIndex == receivedBlock.index) {
          // TODO sprawdzaj hash bloku
          this.addBlock(receivedBlock);
          console.log(
            `🔳 Received new block. Blockchain now ${this.blockchain.blocks.length} long.`,
          );
          context.response.body = {
            message: "Thanks for the new block!",
          };
        } else {
          console.log(
            `Received index ${receivedBlock.index} but wanted ${nextIndex}`,
          );
          context.response.body = { message: "Wrong block index." };
        }
        context.response.status = 200;
      } else {
        context.response.status = 400;
        context.response.body = {
          message: "Unsupported content type",
        };
      }
    } catch (error) {
      console.error("Error handling request:", error);
      context.response.status = 500;
      context.response.body = {
        message: "Internal Server Error",
      };
    }
  }

  // TODO
  async handleGetBalance(context: any) {
    try {
      const body = context.request.body;
      if (body.type() !== "json") {
        context.response.status = 400;
        context.response.body = {
          message: "Unsupported content type",
        };
        return;
      }

      const req = await body.json();
      const address = req.address as string;
      const balance = this.blockchain.getBalance(address);

      context.response.body = { balance: balance };
      context.response.status = 200;
    } catch (error) {
      console.error("Error handling request:", error);
      context.response.status = 500;
      context.response.body = {
        message: "Internal Server Error",
      };
    }
  }

  //TODO
  // async handleAddTransaction(context: any) {
  //   try {
  //     const body = context.request.body;
  //     if (body.type() === "json") {
  //       context.response.status = 400;
  //       context.response.body = {
  //         message: "Unsupported content type",
  //       };
  //     } else {
  //       const req = await body.json();
  //       const mess = req as GenericMessage;
  //       if (this.knownMessages.includes(mess.token)) {
  //         return;
  //       }
  //       this.broadcast(mess, "/transactions");

  //       const receivedTransaction = Transaction.fromJson(
  //         JSON.parse(mess.content),
  //       );
  //     }
  //     context.response.status = 200;
  //   } catch (error) {
  //     console.error("Error handling request:", error);
  //     context.response.status = 500;
  //     context.response.body = {
  //       message: "Internal Server Error",
  //     };
  //   }
  // }
}
