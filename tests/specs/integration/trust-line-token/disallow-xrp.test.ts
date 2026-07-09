import { XRP_TRANSFER_AMOUNT } from "@tests/utils/data.js";
import { connectClient, disconnectClient, setupWallets } from "@tests/utils/test.helper.js";
import {
  clearAccountFlag,
  getXRPBalance,
  setAccountFlag,
  transferXRP,
  verifyAccountFlag,
} from "@/services/trustline-token.service.js";
import type { Client, Wallet } from "xrpl";
import { AccountSetAsfFlags } from "xrpl";
import { AccountRootFlags } from "xrpl/dist/npm/models/ledger/index.js";

describe("Trust Line Token DisallowXRP", () => {
  let client: Client;

  let aliceWallet: Wallet;
  let bobWallet: Wallet;

  beforeAll(async () => {
    client = await connectClient("DisallowXRP Flag Test");
    [aliceWallet, bobWallet] = await setupWallets(2);
  }, 90000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 2: Enable DisallowXRP on Bob", () => {
    it("should enable DisallowXRP flag on Bob", async () => {
      console.log("\n==================== PHASE 2: ENABLE DISALLOWXRP ON BOB ====================");

      await setAccountFlag(bobWallet, AccountSetAsfFlags.asfDisallowXRP);
      await verifyAccountFlag(bobWallet.address, AccountRootFlags.lsfDisallowXRP, true);

      console.log("✅ DisallowXRP flag enabled on Bob successfully");
    }, 20000);

    it("should succeed Alice -> Bob XRP transfer with DisallowXRP enabled (advisory only)", async () => {
      console.log("ℹ️ Testing Alice -> Bob XRP transfer with DisallowXRP enabled (advisory flag)...");

      const bobBalanceBefore = await getXRPBalance(bobWallet);

      // DisallowXRP is NOT enforced by XRPL protocol - it's advisory only
      await transferXRP(aliceWallet, bobWallet, XRP_TRANSFER_AMOUNT);

      const bobBalanceAfter = await getXRPBalance(bobWallet);
      expect(bobBalanceAfter).toBeGreaterThan(bobBalanceBefore);

      console.log(
        `ℹ️ DisallowXRP flag is advisory only - XRPL protocol allows XRP transfers to prevent accounts becoming unusable`,
      );
      console.log(`✅ XRP transfer succeeded: Alice -> Bob (${XRP_TRANSFER_AMOUNT} XRP)`);
    }, 30000);

    it("should allow Bob to send XRP to others with DisallowXRP enabled", async () => {
      console.log("💸 Testing Bob -> Alice XRP transfer with Bob having DisallowXRP...");

      const aliceBalanceBefore = await getXRPBalance(aliceWallet);

      await transferXRP(bobWallet, aliceWallet, XRP_TRANSFER_AMOUNT);

      const aliceBalanceAfter = await getXRPBalance(aliceWallet);
      expect(aliceBalanceAfter).toBeGreaterThan(aliceBalanceBefore);

      console.log("✅ Bob can still send XRP to others with DisallowXRP enabled");
    }, 30000);
  });

  describe("Phase 3: Disable DisallowXRP", () => {
    it("should disable DisallowXRP flag on Bob", async () => {
      console.log("\n==================== PHASE 3: DISABLE DISALLOWXRP ====================");

      await clearAccountFlag(bobWallet, AccountSetAsfFlags.asfDisallowXRP);
      await verifyAccountFlag(bobWallet.address, AccountRootFlags.lsfDisallowXRP, false);

      console.log("✅ DisallowXRP flag disabled on Bob successfully");
    }, 20000);

    it("should succeed Alice -> Bob XRP transfer after disabling DisallowXRP", async () => {
      console.log("✅ Testing Alice -> Bob XRP transfer after disabling DisallowXRP...");

      const bobBalanceBefore = await getXRPBalance(bobWallet);

      await transferXRP(aliceWallet, bobWallet, XRP_TRANSFER_AMOUNT);

      const bobBalanceAfter = await getXRPBalance(bobWallet);
      expect(bobBalanceAfter).toBeGreaterThan(bobBalanceBefore);

      console.log(`✅ XRP transfer successful after disabling DisallowXRP: Alice -> Bob (${XRP_TRANSFER_AMOUNT} XRP)`);
    }, 30000);
  });
});
