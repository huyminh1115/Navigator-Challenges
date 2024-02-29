import {
  Field,
  SmartContract,
  state,
  State,
  method,
  Struct,
  ZkProgram,
  SelfProof,
  Provable,
  Bool,
  UInt32,
} from 'o1js';

export class MessageDetail extends Struct({
  agentId: UInt32,
  agentXLocation: UInt32,
  agentYLocation: UInt32,
  checkSum: UInt32,
}) {
  checkAgentId(): Bool {
    return Provable.if(
      this.agentId.lessThanOrEqual(new UInt32(3000)),
      Bool(true),
      Bool(false)
    );
  }

  checkAgentXLocation(): Bool {
    return Provable.if(
      this.agentXLocation.lessThanOrEqual(new UInt32(15000)),
      Bool(true),
      Bool(false)
    );
  }

  checkAgentYLocation(): Bool {
    return this.agentYLocation
      .greaterThan(this.agentXLocation)
      .and(this.agentYLocation.greaterThanOrEqual(new UInt32(5000)))
      .and(this.agentYLocation.lessThanOrEqual(new UInt32(20000)));
  }

  checkChecksum(): Bool {
    return Provable.if(
      this.agentId
        .add(this.agentXLocation)
        .add(this.agentYLocation)
        .equals(this.checkSum),
      Bool(true),
      Bool(false)
    );
  }

  isCorrect(): Bool {
    return this.agentId
      .equals(UInt32.zero)
      .or(
        this.checkAgentId().and(
          this.checkAgentXLocation().and(
            this.checkAgentYLocation().and(this.checkChecksum())
          )
        )
      );
  }
}

export class CheckMessagesOutput extends Struct({
  currentHighestNumber: Field,
}) {}

export const CheckMessages = ZkProgram({
  name: 'CheckMessages',
  publicInput: Field,
  publicOutput: CheckMessagesOutput,
  methods: {
    firstStep: {
      privateInputs: [],
      method(messageNumber: Field): CheckMessagesOutput {
        return new CheckMessagesOutput({
          currentHighestNumber: Field(0),
        });
      },
    },
    nextStep: {
      privateInputs: [SelfProof<Field, CheckMessagesOutput>, MessageDetail],
      method(
        messageNumber: Field,
        preProof: SelfProof<Field, CheckMessagesOutput>,
        messageDetails: MessageDetail
      ): CheckMessagesOutput {
        preProof.verify();

        let isCorrect = messageDetails.isCorrect();
        let currentHighestNumber = preProof.publicOutput.currentHighestNumber;

        let newNumber = Provable.if(
          isCorrect.and(
            messageNumber.greaterThan(
              preProof.publicOutput.currentHighestNumber
            )
          ),
          messageNumber,
          currentHighestNumber
        );

        return new CheckMessagesOutput({
          currentHighestNumber: newNumber,
        });
      },
    },
  },
});

export class CheckMessagesProof extends ZkProgram.Proof(CheckMessages) {}

export class Challenge_2 extends SmartContract {
  @state(Field) currentNumber = State<Field>();

  init() {
    super.init();
  }

  @method checkMessages(proof: CheckMessagesProof) {
    proof.verify();

    let currentMessageNumber = this.currentNumber.getAndRequireEquals();

    let proofMessageNumber = proof.publicOutput.currentHighestNumber;

    this.currentNumber.set(
      Provable.if(
        currentMessageNumber.lessThan(proofMessageNumber),
        proofMessageNumber,
        currentMessageNumber
      )
    );
  }
}
