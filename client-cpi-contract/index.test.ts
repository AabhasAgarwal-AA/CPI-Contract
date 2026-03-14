import { test, expect } from "bun:test";
import { LiteSVM } from "litesvm";
import {
    PublicKey,
    Transaction,
    SystemProgram,
    Keypair,
    LAMPORTS_PER_SOL,
    TransactionInstruction,
} from "@solana/web3.js";

test("CPI works as expected", () => {
    const svm = new LiteSVM();

    const doubleContract = PublicKey.unique();
    const cpiContract = PublicKey.unique();
    svm.addProgramFromFile(doubleContract, "./sol_program_counter_cpi.so");
    svm.addProgramFromFile(cpiContract, "./CPI.so");

    const userAcc = new Keypair();
    const dataAcc = new Keypair();
    svm.airdrop(userAcc.publicKey, BigInt(LAMPORTS_PER_SOL));

    createDataAccountOnChain(svm, dataAcc, userAcc, doubleContract);


    function doubleIt(){
        let ix = new TransactionInstruction({
            keys: [
                { pubkey: dataAcc.publicKey, isSigner: true, isWritable: true },
                { pubkey: doubleContract, isSigner: false, isWritable: false }
            ],
            programId: cpiContract,
            data: Buffer.from("")
        });

        let transaction = new Transaction().add(ix);
        transaction.recentBlockhash = svm.latestBlockhash();
        transaction.feePayer = userAcc.publicKey;
        transaction.add(ix);
        transaction.sign(userAcc, dataAcc);

        const res = svm.sendTransaction(transaction);
        // console.log(res.toString());
        svm.expireBlockhash();
    }

    doubleIt();
    doubleIt();
    doubleIt();
    doubleIt();

    const dataAccountData = svm.getAccount(dataAcc.publicKey);
    // console.log(dataAccountData)

    expect(dataAccountData?.data[0]).toBe(128);
    expect(dataAccountData?.data[1]).toBe(0);
    expect(dataAccountData?.data[2]).toBe(0);
    expect(dataAccountData?.data[3]).toBe(0);

    
});

function createDataAccountOnChain(svm:  LiteSVM, dataAccount: Keypair, payer: Keypair, contractPubkey: PublicKey){
    const blockhash = svm.latestBlockhash();
    
    const ixs = [
        SystemProgram.createAccount({
            fromPubkey: payer.publicKey,
            newAccountPubkey: dataAccount.publicKey,
            lamports: Number(svm.minimumBalanceForRentExemption(BigInt(4))),
            space: 4, 
            programId: contractPubkey
        }),
    ];
    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.add(...ixs);
    tx.sign(payer, dataAccount);
    svm.sendTransaction(tx);
}
