import React, { useState } from "react";
import styles from "./mainStyles";
import {
  Grid,
  Typography,
  Button,
  TextField,
} from "@mui/material/";

import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { AccessToken } from "../../../data/MercadoPagoCredentials";
import CheckoutMercadoPago from "./mercadoPagoView";

export default function MainView() {
  const classes = styles();
  const [totalPrice, setTotalPrice] = useState(0);
  const [preferenceId, setPreferenceId] = useState(null);
  const postOnMercadoPago = () => {
    const meliURL = `https://api.mercadopago.com/checkout/preferences?access_token=${AccessToken}`;
    const productName = "Pack de Etiquetas Correios";
    const productImg =
      "https://static.ellitoral.com//um/fotos/410416_tribuna_union.jpg";
    const params = {
      external_reference: uuidv4(),
      items: [
        {
          title: productName,
          description: "Etiqueta correios",
          quantity: 1,
          unit_price: totalPrice,
          picture_url: productImg,
        },
      ],
    };
    axios
      .post(meliURL, params)
      .then((res) => {
        debugger;
        if (res && res.data && res.data.id) { setPreferenceId(res.data.id) }

        else {

        }
        console.log(res);
      })
      .catch((error) => console.log(error));
  };
  return (
    <Grid
      container
      direction="column"
      alignItems="flex-start"
      className={classes.root}
      style={{ padding: 20 }}
    >
      <Grid item value={totalPrice} onChange={(e) => { setTotalPrice(Number(e.target.value)); }} border={1} style={{ borderColor: "black", padding: 20 }}>
        <TextField type="number" />
        <Grid item>
          <Typography> Etiqueta</Typography>

          <Typography>Total a pagar: ${totalPrice}</Typography>
          {!preferenceId ? (
            <Button onClick={postOnMercadoPago}>Generar link de pago</Button>
          ) : (
            <CheckoutMercadoPago preferenceId={preferenceId} />
          )}

        </Grid>

      </Grid>

    </Grid>
  );
}
