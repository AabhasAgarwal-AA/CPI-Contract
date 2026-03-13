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

test("one transfer", () => {
    const svm = new LiteSVM();

    // contract pubkey 
    const contractPubkey = PublicKey.unique();

    // adding the .so file 
    svm.addProgramFromFile(contractPubkey, "./sol_program_counter_cpi.so");

    // payer pubkey
    const payer = new Keypair();
    svm.airdrop(payer.publicKey, BigInt(LAMPORTS_PER_SOL));

    // data account pubkey 
    const dataAccount = new Keypair();

    // initializing an instruction
    const ixs = [
        SystemProgram.createAccount({
            fromPubkey: payer.publicKey,
            newAccountPubkey: dataAccount.publicKey, 
            lamports: Number(svm.minimumBalanceForRentExemption(BigInt(4))), 
            space: 4, 
            programId: contractPubkey  
        }),
    ];

    // initializing a Transaction class
    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash();;
    tx.feePayer = payer.publicKey; 
    tx.add(...ixs);
    tx.sign(payer, dataAccount);
    svm.sendTransaction(tx);
    const balanceAfter = svm.getBalance(dataAccount.publicKey);

    // testing the first instruction 
    expect(balanceAfter).toBe(svm.minimumBalanceForRentExemption(BigInt(4)));

    // initializing second instruction
    function doubleIt(){
        const ix2 = new TransactionInstruction({
            keys: [
                {pubkey: dataAccount.publicKey, isSigner: false, isWritable: true}, 
            ], 
            programId: contractPubkey, 
            data: Buffer.from(""),
        });

        const tx2 = new Transaction(); 
        tx2.recentBlockhash = svm.latestBlockhash(); 
        tx2.feePayer = payer.publicKey; 
        tx2.add(ix2); 
        tx2.sign(payer); 
        const response = svm.sendTransaction(tx2); 
        console.log(response.toString());
        svm.expireBlockhash();
    }

    doubleIt();
    doubleIt();
    doubleIt();
    doubleIt();

    const newDataAccount = svm.getAccount(dataAccount.publicKey);
    // console.log(newDataAccount?.data);
    // console.log(newDataAccount);

    // testing the second instruction
    expect(newDataAccount?.data[0]).toBe(8);
    expect(newDataAccount?.data[1]).toBe(0);
    expect(newDataAccount?.data[2]).toBe(0);
    expect(newDataAccount?.data[3]).toBe(0);

});
