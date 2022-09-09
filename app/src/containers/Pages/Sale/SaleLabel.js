import React from 'react';
import { Button, Grid, Table, TableBody, TableCell, TableHead, TableRow, TextField } from '@mui/material';



const createData = (id, date, name, shipTo, paymentMethod, amount) => {
  return { id, date, name, shipTo, paymentMethod, amount };
}


const rows = [
  createData(0, '16 Mar, 2019', 'Elvis Presley', 'Tupelo, MS', 'VISA ⠀•••• 3719', 312.44),
  createData(1, '16 Mar, 2019', 'Paul McCartney', 'London, UK', 'VISA ⠀•••• 2574', 866.99),
  createData(2, '16 Mar, 2019', 'Tom Scholz', 'Boston, MA', 'MC ⠀•••• 1253', 100.81),
  createData(3, '16 Mar, 2019', 'Michael Jackson', 'Gary, IN', 'AMEX ⠀•••• 2000', 654.39),
  createData(4, '15 Mar, 2019', 'Bruce Springsteen', 'Long Branch, NJ', 'VISA ⠀•••• 5919', 212.79),
];

const SaleLabel = () => {
  return (
    <React.Fragment>

      <Grid container spacing={1} flexDirection={'column'} >
        <Grid item xs={6} >
          <TextField placeholder='Altura' />
        </Grid>
        <Grid item xs={6} >
          <TextField placeholder='Largura' />
        </Grid>
        <Grid item xs={6} >
          <TextField placeholder='Profundidade' />
        </Grid>
        <Grid item xs={6} >
          <TextField placeholder='Peso' />
        </Grid>
        <Grid item xs={6} >
          <TextField placeholder='Peso' />
        </Grid>
        <Grid item xs={6}>
          <Button variant="contained" color="primary" >
            Consultar
          </Button>
        </Grid>
      </Grid>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Etiqueta</TableCell>
            <TableCell>Destinatario</TableCell>
            <TableCell>Endreço</TableCell>
            <TableCell>Serviço</TableCell>
            <TableCell align="right">Valor</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <Button><TableCell>{row.date}s</TableCell></Button>
              <TableCell>{row.name}</TableCell>
              <TableCell>{row.shipTo}</TableCell>
              <TableCell>{row.paymentMethod}</TableCell>
              <TableCell align="right">{row.amount}</TableCell>
            </TableRow>
          ))}
        </TableBody>

      </Table>



    </React.Fragment>
  );
}

export default SaleLabel