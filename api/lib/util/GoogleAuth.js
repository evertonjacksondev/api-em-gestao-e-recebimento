const {OAuth2Client} = require('google-auth-library');

    const client = new OAuth2Client("994466419809-ramfmi15g5efqgr7vg7pu8e2klome5qm.apps.googleusercontent.com");
   
    
   const googleAuth = async (token) =>{

    try{
      const ticket = await client.verifyIdToken({
        idToken: token,
        requiredAudience: "994466419809-ramfmi15g5efqgr7vg7pu8e2klome5qm.apps.googleusercontent.com",  // Specify the CLIENT_ID of the app that accesses the backend

    });
    const payload = ticket.getPayload();
    const userid = payload['sub'];

    return ticket;
    }catch(error){
      return false
    }
 
  }

   
  module.exports = {
    googleAuth,
  }



