import { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  executePaymentService,
  executeSmartPayment,
  wldToWei,
  approveWLDSpending,
  hassufficientAllowance,
  PAYMENT_SERVICE_CONFIG,
} from "../utils/paymentService";
import { waitForTransactionConfirmation } from "../utils/paymentVerification";

export interface PaymentData {
  orderId: string;
  amount: number; // Amount in WLD
  walletAddress: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export interface UsePaymentServiceReturn {
  processPayment: (data: PaymentData) => Promise<PaymentResult>;
  processPaymentWithApproval: (data: PaymentData) => Promise<PaymentResult>;
  processSmartPayment: (data: PaymentData) => Promise<PaymentResult>;
  approveTokens: (
    walletAddress: string,
    amount: number
  ) => Promise<PaymentResult>;
  executePaymentOnly: (data: PaymentData) => Promise<PaymentResult>;
  checkAllowance: (walletAddress: string, amount: number) => Promise<boolean>;
  isProcessing: boolean;
  error: string | null;
}

/**
 * Hook for processing payments through PaymentService contract
 * Handles the complete payment flow: contract call -> confirmation -> verification -> status update
 */
export function usePaymentService(): UsePaymentServiceReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processPayment = useCallback(
    async (data: PaymentData): Promise<PaymentResult> => {
      setIsProcessing(true);
      setError(null);

      try {
        console.log("🚀 Starting PaymentService payment process:", data);

        // Step 1: Convert WLD amount to wei
        const amountInWei = wldToWei(data.amount);
        console.log(`💰 Amount: ${data.amount} WLD = ${amountInWei} wei`);

        // Step 2: Execute payment through PaymentService contract
        console.log("📝 Executing PaymentService contract call...");
        console.log("💡 PAYMENT PROCESS DETAILS:");
        console.log("   Order ID:", data.orderId);
        console.log("   Wallet Address:", data.walletAddress);
        console.log("   Amount (WLD):", data.amount);
        console.log("   Amount (wei):", amountInWei);
        console.log("   Contract:", PAYMENT_SERVICE_CONFIG.CONTRACT_ADDRESS);

        const paymentResponse = await executePaymentService(
          {
            amount: amountInWei,
            referenceId: data.orderId,
          },
          PAYMENT_SERVICE_CONFIG.WLD_TOKEN_ADDRESS,
          PAYMENT_SERVICE_CONFIG.RECIPIENT_ADDRESS
        );

        // Step 3: Check if payment was successful
        if (paymentResponse.finalPayload.status === "error") {
          const errorCode = paymentResponse.finalPayload.error_code;
          console.error("❌ PaymentService transaction failed:", errorCode);

          // Throw standardized error codes that can be handled by ErrorMessage function
          if (errorCode) {
            throw new Error(errorCode);
          } else {
            throw new Error("payment_failed");
          }
        }

        const transactionId = paymentResponse.finalPayload.transaction_id;
        if (!transactionId) {
          throw new Error("No transaction ID received from payment");
        }

        console.log("✅ PaymentService transaction submitted:", transactionId);

        // Step 4: Wait for transaction confirmation
        console.log("⏳ Waiting for transaction confirmation...");
        try {
          await waitForTransactionConfirmation(transactionId);
          console.log("✅ Transaction confirmed on blockchain");
        } catch (confirmationError) {
          console.warn(
            "⚠️ Transaction confirmation timeout, but continuing...",
            confirmationError
          );
          // Continue with the process even if confirmation times out
          // The transaction might still be successful
        }

        // Step 5: Log payment completion
        // Note: Backend will verify the transaction and update order status from pending to paid
        console.log("✅ Payment transaction submitted successfully");
        console.log(
          "🔍 Backend will verify transaction and update order status"
        );

        console.log("🎉 Payment process completed successfully!");
        toast.success("Payment successful!");

        return {
          success: true,
          transactionId: transactionId,
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Payment processing failed";
        console.error("❌ Payment process failed:", error);
        setError(errorMessage);
        toast.error(errorMessage);

        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const processPaymentWithApproval = useCallback(
    async (data: PaymentData): Promise<PaymentResult> => {
      setIsProcessing(true);
      setError(null);

      try {
        console.log("🚀 Starting PaymentService payment with approval:", data);

        // Step 1: Convert WLD amount to wei
        const amountInWei = wldToWei(data.amount);
        console.log(`💰 Amount: ${data.amount} WLD = ${amountInWei} wei`);

        // Step 2: First approve WLD token spending
        console.log("💰 Approving WLD token spending...");
        const approvalResponse = await approveWLDSpending(amountInWei);

        if (approvalResponse.finalPayload.status === "error") {
          const errorPayload = approvalResponse.finalPayload as {
            error_code?: string;
          };
          console.error("❌ Token approval failed:", errorPayload.error_code);
          throw new Error(errorPayload.error_code || "approval_failed");
        }

        console.log("✅ Token approval successful");

        // Step 3: Execute payment through PaymentService contract
        console.log("📝 Executing PaymentService contract call...");
        console.log("💡 PAYMENT PROCESS DETAILS:");
        console.log("   Order ID:", data.orderId);
        console.log("   Wallet Address:", data.walletAddress);
        console.log("   Amount (WLD):", data.amount);
        console.log("   Amount (wei):", amountInWei);
        console.log("   Contract:", PAYMENT_SERVICE_CONFIG.CONTRACT_ADDRESS);

        const paymentResponse = await executePaymentService(
          {
            amount: amountInWei,
            referenceId: data.orderId,
          },
          PAYMENT_SERVICE_CONFIG.WLD_TOKEN_ADDRESS,
          PAYMENT_SERVICE_CONFIG.RECIPIENT_ADDRESS
        );

        // Step 4: Check if payment was successful
        if (paymentResponse.finalPayload.status === "error") {
          const errorPayload = paymentResponse.finalPayload as {
            error_code?: string;
          };
          console.error(
            "❌ PaymentService transaction failed:",
            errorPayload.error_code
          );

          // Throw standardized error codes that can be handled by ErrorMessage function
          if (errorPayload.error_code) {
            throw new Error(errorPayload.error_code);
          } else {
            throw new Error("payment_failed");
          }
        }

        const successPayload = paymentResponse.finalPayload as {
          transaction_id?: string;
        };
        const transactionId = successPayload.transaction_id;
        if (!transactionId) {
          throw new Error("No transaction ID received from payment");
        }

        console.log("✅ PaymentService transaction submitted:", transactionId);

        // Step 5: Wait for transaction confirmation
        console.log("⏳ Waiting for transaction confirmation...");
        try {
          await waitForTransactionConfirmation(transactionId);
          console.log("✅ Transaction confirmed on blockchain");
        } catch (confirmationError) {
          console.warn(
            "⚠️ Transaction confirmation timeout, but continuing...",
            confirmationError
          );
          // Continue with the process even if confirmation times out
          // The transaction might still be successful
        }

        console.log("🎉 Payment process with approval completed successfully!");
        toast.success("Payment successful!");

        return {
          success: true,
          transactionId: transactionId,
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Payment processing failed";
        console.error("❌ Payment process with approval failed:", error);
        setError(errorMessage);
        toast.error(errorMessage);

        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const processSmartPayment = useCallback(
    async (data: PaymentData): Promise<PaymentResult> => {
      setIsProcessing(true);
      setError(null);

      try {
        console.log("🧠 Starting smart PaymentService payment:", data);

        // Step 1: Convert WLD amount to wei
        const amountInWei = wldToWei(data.amount);
        console.log(`💰 Amount: ${data.amount} WLD = ${amountInWei} wei`);

        // Step 2: Use smart payment that handles allowance automatically
        console.log("🎯 Using smart payment flow...");
        const paymentResponse = await executeSmartPayment(
          {
            amount: amountInWei,
            referenceId: data.orderId,
          },
          data.walletAddress
        );

        // Step 3: Check if payment was successful
        if (paymentResponse.finalPayload.status === "error") {
          const errorPayload = paymentResponse.finalPayload as {
            error_code?: string;
          };
          console.error(
            "❌ Smart PaymentService transaction failed:",
            errorPayload.error_code
          );

          // Throw standardized error codes that can be handled by ErrorMessage function
          if (errorPayload.error_code) {
            throw new Error(errorPayload.error_code);
          } else {
            throw new Error("payment_failed");
          }
        }

        const successPayload = paymentResponse.finalPayload as {
          transaction_id?: string;
        };
        const transactionId = successPayload.transaction_id;
        if (!transactionId) {
          throw new Error("No transaction ID received from payment");
        }

        console.log(
          "✅ Smart PaymentService transaction submitted:",
          transactionId
        );

        // Step 4: Wait for transaction confirmation
        console.log("⏳ Waiting for transaction confirmation...");
        try {
          await waitForTransactionConfirmation(transactionId);
          console.log("✅ Transaction confirmed on blockchain");
        } catch (confirmationError) {
          console.warn(
            "⚠️ Transaction confirmation timeout, but continuing...",
            confirmationError
          );
          // Continue with the process even if confirmation times out
          // The transaction might still be successful
        }

        console.log("🎉 Smart payment process completed successfully!");
        toast.success("Payment successful!");

        return {
          success: true,
          transactionId: transactionId,
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Payment processing failed";
        console.error("❌ Smart payment process failed:", error);
        setError(errorMessage);
        toast.error(errorMessage);

        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const approveTokens = useCallback(
    async (walletAddress: string, amount: number): Promise<PaymentResult> => {
      setIsProcessing(true);
      setError(null);

      try {
        console.log("💰 APPROVING TOKENS ONLY:");
        console.log("========================");
        console.log("Wallet Address:", walletAddress);
        console.log("Amount (WLD):", amount);

        // Step 1: Convert WLD amount to wei
        const amountInWei = wldToWei(amount);
        console.log(`💰 Amount: ${amount} WLD = ${amountInWei} wei`);

        // Step 2: Execute approval only
        console.log("✍️ Submitting approval transaction...");
        const approvalResponse = await approveWLDSpending(amountInWei);

        if (approvalResponse.finalPayload.status === "error") {
          const errorPayload = approvalResponse.finalPayload as {
            error_code?: string;
          };
          console.error("❌ Token approval failed:", errorPayload.error_code);
          throw new Error(errorPayload.error_code || "approval_failed");
        }

        const successPayload = approvalResponse.finalPayload as {
          transaction_id?: string;
        };
        const transactionId = successPayload.transaction_id;

        console.log("✅ Token approval submitted:", transactionId);

        // Step 3: Wait for approval confirmation
        console.log("⏳ Waiting for approval confirmation...");
        try {
          if (transactionId) {
            await waitForTransactionConfirmation(transactionId);
            console.log("✅ Approval confirmed on blockchain");
          }
        } catch (confirmationError) {
          console.warn(
            "⚠️ Approval confirmation timeout, but continuing...",
            confirmationError
          );
        }

        console.log("🎉 Token approval completed successfully!");
        toast.success(
          "Token approval successful! You can now proceed with payment."
        );

        return {
          success: true,
          transactionId: transactionId,
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Token approval failed";
        console.error("❌ Token approval process failed:", error);
        setError(errorMessage);
        toast.error(errorMessage);

        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const executePaymentOnly = useCallback(
    async (data: PaymentData): Promise<PaymentResult> => {
      setIsProcessing(true);
      setError(null);

      try {
        console.log("💳 EXECUTING PAYMENT ONLY:");
        console.log("==========================");
        console.log("Assuming tokens are already approved...");

        // Step 1: Convert WLD amount to wei
        const amountInWei = wldToWei(data.amount);
        console.log(`💰 Amount: ${data.amount} WLD = ${amountInWei} wei`);

        // Step 2: Execute payment directly (no approval)
        console.log("📝 Executing PaymentService contract call...");
        console.log("💡 PAYMENT PROCESS DETAILS:");
        console.log("   Order ID:", data.orderId);
        console.log("   Wallet Address:", data.walletAddress);
        console.log("   Amount (WLD):", data.amount);
        console.log("   Amount (wei):", amountInWei);
        console.log("   Contract:", PAYMENT_SERVICE_CONFIG.CONTRACT_ADDRESS);

        const paymentResponse = await executePaymentService(
          {
            amount: amountInWei,
            referenceId: data.orderId,
          },
          PAYMENT_SERVICE_CONFIG.WLD_TOKEN_ADDRESS,
          PAYMENT_SERVICE_CONFIG.RECIPIENT_ADDRESS
        );

        // Step 3: Check if payment was successful
        if (paymentResponse.finalPayload.status === "error") {
          const errorPayload = paymentResponse.finalPayload as {
            error_code?: string;
          };
          console.error(
            "❌ PaymentService transaction failed:",
            errorPayload.error_code
          );

          // Throw standardized error codes that can be handled by ErrorMessage function
          if (errorPayload.error_code) {
            throw new Error(errorPayload.error_code);
          } else {
            throw new Error("payment_failed");
          }
        }

        const successPayload = paymentResponse.finalPayload as {
          transaction_id?: string;
        };
        const transactionId = successPayload.transaction_id;
        if (!transactionId) {
          throw new Error("No transaction ID received from payment");
        }

        console.log("✅ PaymentService transaction submitted:", transactionId);

        // Step 4: Wait for transaction confirmation
        console.log("⏳ Waiting for payment confirmation...");
        try {
          await waitForTransactionConfirmation(transactionId);
          console.log("✅ Payment confirmed on blockchain");
        } catch (confirmationError) {
          console.warn(
            "⚠️ Payment confirmation timeout, but continuing...",
            confirmationError
          );
        }

        console.log("🎉 Payment completed successfully!");
        toast.success("Payment successful!");

        return {
          success: true,
          transactionId: transactionId,
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Payment processing failed";
        console.error("❌ Payment process failed:", error);
        setError(errorMessage);
        toast.error(errorMessage);

        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const checkAllowance = useCallback(
    async (walletAddress: string, amount: number): Promise<boolean> => {
      try {
        const amountInWei = wldToWei(amount);
        return await hassufficientAllowance(walletAddress, amountInWei);
      } catch (error) {
        console.error("❌ Failed to check allowance:", error);
        return false;
      }
    },
    []
  );

  return {
    processPayment,
    processPaymentWithApproval,
    processSmartPayment,
    approveTokens,
    executePaymentOnly,
    checkAllowance,
    isProcessing,
    error,
  };
}
