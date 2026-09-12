function startGame() {
    if(tinyParkMode()==='versus'){
        if(!window.versusSession) window.versusSession=new VersusSession();
        return;
    }
    document.getElementById("c").style.display = "";
    if(!window.clientConnection)document.getElementById("restartWrap").style.display="";
    document.getElementById("menu").style.display = "none";
    document.getElementById("restartLevel").style.display = "";
    if (!mainGame.matter.running) {
        startMainGame();
        setInterval(() => {
            if (window.hostConnection) hostConnection.broadcast(JSON.stringify({campaign:window.parkCampaign||null,startGame:true}));
        }, 3000);
    }
}

function hideGame() {
    document.getElementById("menu").style.display = "";
    document.getElementById("c").style.display = "none";
}

function setRoomCode(c) {
    document.getElementById("roomCode").textContent = c;
}
