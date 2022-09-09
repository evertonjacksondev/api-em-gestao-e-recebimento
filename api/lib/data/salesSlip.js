let axios = require('axios');

const salesSlip = async (req) => {

let ret = await axios.get(
    `http://localhost:2530/dashboard/order/salesslip/${req.params.orderid}`,
    {
      headers: {
        tokenaccount: 'ZW7XR3QB0S4SE1A',
        Authorization: 'Bearer SW52ZW50b1Npc3RlbWFzL0h1YkRpZ2lncm93L1BlcnNpc3RlbnRBY2Nlc3MvR2VuZXJhdGVkQnlEaWVnby8wMzA1MjAyMQ=='
      }
    }
  );
  return ret.data


}

module.exports = {salesSlip}