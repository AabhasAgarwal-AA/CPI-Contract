# Solana CPI Example: Double Contract

A minimal two-program example demonstrating **Cross-Program Invocation (CPI)** on Solana using native Rust. One program holds and mutates on-chain state (the "Double" contract); a second program invokes it via CPI (the "CPI Caller" contract).

---

## Programs

| Program | Description |
|---|---|
| `double` | Stores a `u32` counter in an account. On first call sets it to `1`, on every subsequent call doubles it. |
| `cpi_caller` | Receives a data account and the Double program's address, then invokes Double via CPI. |

---

## Architecture

### How This Works in Web2

In a traditional Web2 backend, this pattern maps directly to a **service-to-service call**:

1. A client sends an HTTP request to **Service A** (the CPI Caller).
2. Service A validates the request and constructs an internal call to **Service B** (the Double service), passing along a reference to a shared database row (the data account).
3. Service B reads the current value from the database, applies the doubling logic, and writes back the result.
4. Control returns to Service A, which responds to the original client.

The database row is the mutable shared state. Both services agree on a schema (`{ count: u32 }`). Service B owns the write logic; Service A is just an orchestrator. Authentication is typically handled via API keys, JWTs, or IAM roles checked at the service boundary.

### How This Works on Solana

Solana replaces this entire stack with on-chain primitives:

**Accounts are the database.** Every piece of mutable state lives in a dedicated account — a raw byte buffer owned by a program. The `OnChainData` struct (`{ count: u32 }`) is serialized with Borsh directly into the data account's byte array. There is no separate database; the ledger *is* the database.

**Programs are stateless logic.** Neither the Double program nor the CPI Caller stores any state inside the program binary itself. All state lives in accounts that are passed in at call time. This is the reverse of Web2, where the service owns its database connection.

**Transactions bundle everything upfront.** Before a transaction executes, the client must declare every account it will touch — including accounts that will only be accessed inside a CPI. The Solana runtime uses this manifest to schedule parallel execution and enforce access rules. There are no dynamic lookups mid-execution.

**CPI is a first-class primitive.** The `invoke()` call in the CPI Caller constructs an `Instruction` struct (target program ID + accounts + data), then hands it to the Solana runtime. The runtime switches execution context to the Double program while keeping the same transaction signer set. This is analogous to an in-process function call, not a new network hop — everything runs atomically within a single transaction.

**The execution flow:**

```
Client Transaction
│
├─ accounts: [data_account, double_program_id]
│
└─► CPI Caller (process_instruction)
        │
        ├─ Reads data_account and double_program_id from accounts slice
        ├─ Constructs Instruction { program_id, accounts, data: [] }
        │
        └─► invoke() → Double Program (process_instruction)
                  │
                  ├─ Deserializes OnChainData from data_account
                  ├─ Applies doubling logic (0 → 1, n → 2n)
                  └─ Serializes updated OnChainData back to data_account
```

Both programs run within the same atomic transaction. If Double fails, the entire transaction rolls back — including any work done by CPI Caller before the `invoke()` call.

---

## Tradeoffs & Constraints

### What You Gain

- **Atomicity.** CPI calls within a transaction are all-or-nothing. There is no partial failure state to reconcile, unlike distributed Web2 service calls where you need sagas, compensating transactions, or message queues.
- **Composability.** Any program can invoke any other program permissionlessly, as long as it knows the program ID and constructs a valid instruction. No API contracts, versioning negotiations, or service agreements required.
- **Trustless execution.** The runtime enforces ownership and signer rules. The Double program can verify that the data account is writable and owned by itself without trusting the caller.

### Constraints & Gotchas

**Accounts must be declared upfront.** The client submitting the transaction must include `data_account` and `double_program_id` in the transaction's account list. Any account accessed inside a CPI that was not declared in the original transaction will cause the transaction to fail. This is a significant departure from Web2, where a service can query any resource it has credentials for at runtime.

**The signer set does not automatically extend.** When using `invoke()`, the called program inherits the signers from the original transaction — it does not gain any new authority. If the Double program required `data_account.is_signer`, the account would need to have been signed by the original client. For PDAs (program-derived addresses), you would use `invoke_signed()` instead to extend signing authority.

**Compute budget is shared.** Every instruction on Solana has a compute unit (CU) budget. CPI calls consume CUs from the same budget as the calling program. Deeply nested CPIs or programs that do heavy computation can exhaust the budget and fail the transaction. As of recent Solana versions, the maximum CPI call depth is 4.

**Borsh serialization owns the full account buffer.** `OnChainData::try_from_slice` expects the entire account data buffer to be a valid Borsh-encoded struct. If the account size does not exactly match the struct's serialized size, deserialization will fail. Account reallocation requires explicit use of `AccountInfo::realloc`.

**The signer check is commented out.** The Double program contains a commented-out `is_signer` check. In production, any program that allows arbitrary callers to mutate an account should enforce ownership or signer constraints; otherwise any program on the network can invoke it and modify the data account.

**No return values across CPI.** Unlike a Web2 function call, `invoke()` does not return data from the callee. The only way to observe the result of a CPI is to inspect the account state after the call — the callee must write its output into an account that the caller can then read.

---

## Project Structure

```
.
├── double/
│   └── src/
│       └── lib.rs          # OnChainData struct + doubling logic
└── cpi_caller/
    └── src/
        └── lib.rs          # Constructs Instruction and calls invoke()
```

---

## Prerequisites

- [Rust](https://rustup.rs/) with `solana` toolchain target
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)
- A running local validator (`solana-test-validator`) or devnet access

## Build

```bash
cargo build-sbf --manifest-path double/Cargo.toml
cargo build-sbf --manifest-path cpi_caller/Cargo.toml
```

## Deploy

```bash
solana program deploy double/target/deploy/double.so
solana program deploy cpi_caller/target/deploy/cpi_caller.so
```

Create a data account with exactly 4 bytes (size of `u32`) and assign it to the Double program before invoking the CPI Caller.
