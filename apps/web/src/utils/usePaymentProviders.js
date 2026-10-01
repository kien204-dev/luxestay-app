import { useEffect, useState } from "react";
import { getPaymentProviders } from "../services/paymentService";

const DEFAULT_PROVIDERS = ["vnpay"];

// Which online payment buttons to show. The API decides (MoMo is opt-in),
// and VNPay alone is assumed until it answers.
export function usePaymentProviders() {
  const [providers, setProviders] = useState(DEFAULT_PROVIDERS);

  useEffect(() => {
    let cancelled = false;

    getPaymentProviders()
      .then((res) => {
        if (!cancelled && Array.isArray(res.data?.providers)) {
          setProviders(res.data.providers);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return providers;
}
