import React, { useEffect } from "react";
import { useMercadopago } from "react-sdk-mercadopago";
import { PublicKey } from "../../../data/MercadoPagoCredentials";

export default function CheckoutMercadoPago(props) {
  const { preferenceId } = props;

  const mercadopago = useMercadopago.v2(PublicKey, { locale: "es-AR" });

  useEffect(() => {

    if (mercadopago && preferenceId) {
      mercadopago.checkout({
        preference: { id: preferenceId },
        render: {
          container: ".cho-container",
          label: "Pagar",
        },
      });
    }
  }, [mercadopago && preferenceId]);

  return (
    <div>
      <div class="cho-container" />
    </div>
  );
}
