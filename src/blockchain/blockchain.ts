import { Block } from "../blockchain/block.ts";

class Blockchain {
  difficulty: number = 4;
  reward: number = 10;
  blocks: Block[] = [];

  constructor(blocks: Block[] | undefined) {
    this.blocks = blocks ?? [this.startGenesisBlock()];
  }

  startGenesisBlock(): Block {
    return new Block(Date.parse("2001-03-15"), []);
  }

  getLatestBlock(): Block {
    return this.blocks[this.blocks.length - 1];
  }

  // na razie kopanie bez transakcji
  mineBlock() {
    const newBlock = new Block(
      Date.now(),
      [],
      this.getLatestBlock().hash,
      this.getLatestBlock().index + 1,
    );
    newBlock.mine(this.difficulty);
    return newBlock;
  }

  saveBlockChain(path: string): void {
    // Save the whole object to a file
    Deno.writeTextFileSync(path + "blockchain.json", JSON.stringify(this));
    console.log("Blockchain saved");
  }

  static fromJson(json: string): Blockchain {
    // Load blockchain from a json string
    const obj = JSON.parse(json);
    const blockchain = new Blockchain([]);
    blockchain.blocks = obj.blocks.map((block: object) => Block.fromJson(block));
    return blockchain;
  }

  isValid(): boolean {
    // Complete validation method for the blockchain
    if (!this.validateGenesisBlock(this.blocks[0])) {
      return false;
    }

    for (let i = 1; i < this.blocks.length; i++) {
      const currentlyCheckingBlock = this.blocks[i];

      // Check if the index is correct
      if (currentlyCheckingBlock.index !== i) {
        return false;
      }
      // Validate the block
      const previousBlock = this.blocks[i - 1];
      if (!currentlyCheckingBlock.isValid(previousBlock, this.difficulty)) {
        return false;
      }
    }

    // TODO validate transactions after they're implemented

    console.log("Blockchain is valid");
    return true;
  }

  private validateGenesisBlock(genesisBlock: Block): boolean {
    // Check if the genesis block is as expected
    const expectedGenesisBlock = this.startGenesisBlock();
    return genesisBlock.toHash() === expectedGenesisBlock.toHash() &&
      genesisBlock.isValidAlone(0);
  }
}

export { Blockchain };
