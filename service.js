/**
 * VOX backend service
 */

// Main VOX Address
const VOX_ADDRESS = "0x789DE9ADB2241184E7EBB4B5D59C46AE36A768C5E573AF2ECFBA8C877F9EA2D6";

// Are we logging data
var logs = true;

// Check if the transaction is valid
function checkTxn(msg) {
  if (msg.data.coin.tokenid != "0x00") {
    MDS.log("Message not sent as Minima.. ! " + msg.data.coin.tokenid);
    return false;
  } else if (+msg.data.coin.amount < 0.01) {
    MDS.log("Message below 0.01 threshold.. ! " + msg.data.coin.amount);
    return false;
  }
  return true;
}

// Main message handler
MDS.init(function (msg) {
  if (msg.event == "inited") {
    // Set up coin notification
    MDS.cmd(
      "coinnotify action:add address:" + VOX_ADDRESS,
      function (startup) {
        MDS.log("Coin notification set up for VOX_ADDRESS");
      }
    );
  } else if (msg.event == "NOTIFYCOIN") {
    // Check if it's a message for our VOX_ADDRESS
    if (msg.data.address === VOX_ADDRESS) {
      MDS.log("Received on VOX address");
      
      // Check if valid amount
      if (!checkTxn(msg)) {
        MDS.log("ERROR: Invalid Message");
        return;
      }

      // Process the transaction
      const txnId = msg.data.coin.coinid;
      const amount = msg.data.coin.amount;
      const sender = stripBrackets(msg.data.coin.state[0]); // Assuming sender's address is in state[0]
      
      // Create notification message
      const notificationMsg = `New VOX transaction: ${amount} Minima from ${sender}`;
      
      // Send notification to the main app
      MDS.cmd("notify message:\"" + notificationMsg + "\"", function(resp){
        if(resp.status){
          MDS.log("Notification sent successfully");
        } else {
          MDS.log("Failed to send notification: " + resp.error);
        }
      });

      // You can add more processing here if needed
      
      // Broadcast a message to the main app
      MDS.cmd("comms:broadcast message:\"NEW_VOX_TXN\"", function(resp){
        if(resp.status){
          MDS.log("Broadcast sent successfully");
        } else {
          MDS.log("Failed to send broadcast: " + resp.error);
        }
      });
    }
  }
});

// Helper function to strip brackets if present
function stripBrackets(str) {
  if (str.startsWith("[") && str.endsWith("]")) {
    return str.slice(1, -1);
  }
  return str;
}