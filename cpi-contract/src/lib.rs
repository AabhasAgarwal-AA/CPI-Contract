use solana_program::{
    account_info::next_account_info, 
    entrypoint::{__AccountInfo, ProgramResult}, 
    instruction::{AccountMeta, Instruction}, 
    program::invoke, 
    pubkey::Pubkey, 
    entrypoint
};

entrypoint!(process_instruction);

fn process_instruction(
    publicKey: &Pubkey, 
    accounts: &[__AccountInfo], 
    instruction_data: &[u8]
) -> ProgramResult {

    let mut iter = accounts.iter();
    let data_account = next_account_info(&mut iter)?;
    let double_contract_address = next_account_info(&mut iter)?;

    let instruction = Instruction{
        program_id: *double_contract_address.key, 
        accounts: vec![AccountMeta{
            is_signer: true, 
            is_writable: true, 
            pubkey: *data_account.key
        }], 
        data: vec![],
    };

    invoke(&instruction, &[data_account.clone()]);

    Ok(())
}