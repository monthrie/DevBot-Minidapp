MDS.init(function(msg){
    if(msg.event == "inited"){
        console.log("Service initialized");
    } else if(msg.event == "MAXIMA"){
        // Handle incoming Maxima messages
        if(msg.data.application == "YourAppName"){
            console.log("Received message:", msg.data);
            // Notify the main app
            MDS.notify("New message received from " + msg.data.from);
        }
    }
});