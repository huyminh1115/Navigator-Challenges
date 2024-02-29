import {
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  Provable,
  UInt32,
  Cache,
} from 'o1js';
import {
  Challenge_2,
  CheckMessages,
  MessageDetail,
  CheckMessagesProof,
} from './Challenge_2';

let proofsEnabled = false;

interface Message {
  messageNumber: Field;
  messageDetail: MessageDetail;
}

describe('Challenge_2', () => {
  let deployerAccount: PublicKey,
    deployerKey: PrivateKey,
    senderAccount: PublicKey,
    senderKey: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkApp: Challenge_2;

  beforeAll(async () => {
    const cache = Cache.FileSystem('./caches');
    if (proofsEnabled) {
      Provable.log(CheckMessages.analyzeMethods());
      Provable.log(Challenge_2.analyzeMethods());
      await Challenge_2.compile({ cache });
    }
    await CheckMessages.compile({ cache });

    const Local = Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);
    ({ privateKey: deployerKey, publicKey: deployerAccount } =
      Local.testAccounts[0]);
    ({ privateKey: senderKey, publicKey: senderAccount } =
      Local.testAccounts[1]);
  });

  beforeEach(async () => {
    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkApp = new Challenge_2(zkAppAddress);
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkApp.deploy();
    });
    await txn.prove();
    await txn.sign([deployerKey, zkAppPrivateKey]).send();
  });

  xit('Test if agentId = 0 can be valid without checking outer properties', async () => {
    let proof: CheckMessagesProof = await CheckMessages.firstStep(Field(0));
    let message = new MessageDetail({
      agentId: new UInt32(0),
      agentXLocation: new UInt32(0),
      agentYLocation: new UInt32(0),
      checkSum: new UInt32(0),
    });

    proof = await CheckMessages.nextStep(Field(100), proof, message);

    // checkMessages the proof
    const txn = await Mina.transaction(senderAccount, () => {
      zkApp.checkMessages(proof);
    });
    await txn.prove();
    await txn.sign([senderKey]).send();
    expect(zkApp.currentNumber.get()).toEqual(Field(100));
  });

  it('Test messages number unordered', async () => {
    let proof: CheckMessagesProof = await CheckMessages.firstStep(Field(0));

    const messages: Message[] = [];

    let message = new MessageDetail({
      agentId: new UInt32(0),
      agentXLocation: new UInt32(15000),
      agentYLocation: new UInt32(20000),
      checkSum: new UInt32(36500),
    });

    messages.push({
      messageNumber: Field(4),
      messageDetail: message,
    });

    message = new MessageDetail({
      agentId: new UInt32(1),
      agentXLocation: new UInt32(1000),
      agentYLocation: new UInt32(20000),
      checkSum: new UInt32(21001),
    });

    messages.push({
      messageNumber: Field(5),
      messageDetail: message,
    });

    message = new MessageDetail({
      agentId: new UInt32(0),
      agentXLocation: new UInt32(1),
      agentYLocation: new UInt32(2),
      checkSum: new UInt32(3),
    });

    messages.push({
      messageNumber: Field(1),
      messageDetail: message,
    });

    for (let i = 0; i < messages.length; i++) {
      proof = await CheckMessages.nextStep(
        messages[i].messageNumber,
        proof,
        messages[i].messageDetail
      );
    }
    // checkMessages the proof
    const txn = await Mina.transaction(senderAccount, () => {
      zkApp.checkMessages(proof);
    });
    await txn.prove();
    await txn.sign([senderKey]).send();
    expect(zkApp.currentNumber.get()).toEqual(Field(5));
  });

  it('Check invalid cases', async () => {
    let proof: CheckMessagesProof = await CheckMessages.firstStep(Field(0));
    const messages: Message[] = [];

    // invalid checkSum
    let message = new MessageDetail({
      agentId: new UInt32(2),
      agentXLocation: new UInt32(3),
      agentYLocation: new UInt32(5001),
      checkSum: new UInt32(1),
    });

    messages.push({
      messageNumber: Field(1),
      messageDetail: message,
    });

    // X > Y
    message = new MessageDetail({
      agentId: new UInt32(1),
      agentXLocation: new UInt32(6000),
      agentYLocation: new UInt32(5001),
      checkSum: new UInt32(11002),
    });
    messages.push({
      messageNumber: Field(2),
      messageDetail: message,
    });

    // agentId > 3000
    message = new MessageDetail({
      agentId: new UInt32(3001),
      agentXLocation: new UInt32(0),
      agentYLocation: new UInt32(12000),
      checkSum: new UInt32(15001),
    });
    messages.push({
      messageNumber: Field(3),
      messageDetail: message,
    });

    // X > 15000
    message = new MessageDetail({
      agentId: new UInt32(11),
      agentXLocation: new UInt32(30000),
      agentYLocation: new UInt32(20001),
      checkSum: new UInt32(50012),
    });
    messages.push({
      messageNumber: Field(4),
      messageDetail: message,
    });

    // Y > 20000
    message = new MessageDetail({
      agentId: new UInt32(10),
      agentXLocation: new UInt32(5000),
      agentYLocation: new UInt32(50000),
      checkSum: new UInt32(55010),
    });
    messages.push({
      messageNumber: Field(5),
      messageDetail: message,
    });

    // Y < 5000
    message = new MessageDetail({
      agentId: new UInt32(10),
      agentXLocation: new UInt32(5000),
      agentYLocation: new UInt32(0),
      checkSum: new UInt32(5010),
    });
    messages.push({
      messageNumber: Field(6),
      messageDetail: message,
    });

    for (let i = 0; i < messages.length; i++) {
      for (let i = 0; i < messages.length; i++) {
        proof = await CheckMessages.nextStep(
          messages[i].messageNumber,
          proof,
          messages[i].messageDetail
        );
      }
    }
    // checkMessages the proof
    const txn = await Mina.transaction(senderAccount, () => {
      zkApp.checkMessages(proof);
    });
    await txn.prove();
    await txn.sign([senderKey]).send();
    expect(zkApp.currentNumber.get()).toEqual(Field(0));
  });

  xit('Stress test: 150 messages', async () => {
    let proof: CheckMessagesProof = await CheckMessages.firstStep(Field(0));
    const messages: MessageDetail[] = [];
    for (let index = 0; index < 150; index++) {
      let message = new MessageDetail({
        agentId: new UInt32(0),
        agentXLocation: new UInt32(1),
        agentYLocation: new UInt32(2),
        checkSum: new UInt32(3),
      });
      messages.push(message);
    }

    for (let i = 0; i < messages.length; i++) {
      proof = await CheckMessages.nextStep(Field(i), proof, messages[i]);
    }
    // checkMessages the proof
    const txn = await Mina.transaction(senderAccount, () => {
      zkApp.checkMessages(proof);
    });
    await txn.prove();
    await txn.sign([senderKey]).send();
    expect(zkApp.currentNumber.get()).toEqual(Field(149));
  });
});
