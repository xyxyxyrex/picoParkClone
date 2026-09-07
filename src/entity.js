class EntityHandler {
    constructor(game, options) { this.game = game; this.options={...options}; }
}

class Entity {
    constructor(game, pos, options) {
        this.game = game;
        this.options={...options};
        this.pos = pos;
        this.id = Math.floor(Math.random()*10000);
    }
    update(){}
    render(){}
}

class Key extends Entity {
    constructor(game, pos, options) {
        super(game, pos,options);
        this.ogPos = {...pos};
        this.vel = v();
        this.followingPlayer = undefined;
        this.positionUnlocked = false;
        this.targetedDoor = undefined;
        this.team = options&&options.team||null;
        this.stage = options&&options.stage||null;
        this.unload = false;
    }
    playerAllowed(player){
        if(!player||player.observer) return false;
        if(this.team && player.team!==this.team) return false;
        if(this.stage && player.campaignStage!==this.stage) return false;
        return true;
    }
    doorAllowed(door){
        if(!door||!door.acceptsKey) return false;
        if(this.team && door.team!==this.team) return false;
        if(this.stage && door.campaignStage!==this.stage) return false;
        return true;
    }
    update() {
        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y;
        this.vel.x*=0.93;
        this.vel.y*=0.93;

        if (!this.targetedDoor) {
            if (this.followingPlayer) {
                if(!this.playerAllowed(this.followingPlayer)){ this.followingPlayer=undefined; return; }
                const newPos = v(this.followingPlayer.body.position.x,this.followingPlayer.body.position.y-(45*this.followingPlayer.scale));
                const rawDst = getDst(newPos, this.pos);
                const dst = Math.min(Math.pow(Math.max(rawDst-(55*this.followingPlayer.scale),0),1.2)*0.01, 0.3);
                const angle = -getAngle(newPos, this.pos)+(Math.PI*0.5);
                if (rawDst>300) this.followingPlayer = undefined;
                else { this.vel.x += Math.cos(angle)*dst; this.vel.y += Math.sin(angle)*dst; }
            } else {
                const rawDst = getDst(this.ogPos, this.pos);
                const dst = Math.min(Math.pow(rawDst,1.2)*0.02, 0.4);
                const angle = -getAngle(this.ogPos, this.pos)+(Math.PI*0.5);
                this.vel.x += Math.cos(angle)*dst;
                this.vel.y += Math.sin(angle)*dst;
                this.game.players.forEach(e=>{
                    if(this.playerAllowed(e) && getDst(e.body.position, this.pos)<45){ this.positionUnlocked=true; this.followingPlayer=e; }
                });
            }
            this.game.doors.forEach(e=>{
                if(this.doorAllowed(e) && e.trigger && getDst(e.trigger.rect.position, this.pos)<100) this.targetedDoor=e;
            });
        } else {
            const newPos = v(this.targetedDoor.trigger.rect.position.x,this.targetedDoor.trigger.rect.position.y-45);
            const rawDst = getDst(newPos, this.pos);
            const dst = Math.min(Math.pow(rawDst,1.2)*0.02, 0.9);
            const angle = -getAngle(newPos, this.pos)+(Math.PI*0.5);
            this.vel.x += Math.cos(angle)*dst;
            this.vel.y += Math.sin(angle)*dst;
            if (rawDst<10) { this.targetedDoor.setOpen?this.targetedDoor.setOpen(true):(this.targetedDoor.open=true); this.unload=true; }
        }
    }
    render(ctx) {
        const size = v(35,47);
        ctx.drawImage(levelAtlas,115,514,159,215,this.pos.x-(size.x/2),(this.pos.y-(size.y/2))+(Math.sin((((new Date().getTime())/3000)%1)*2*Math.PI)*10),size.x,size.y);
    }
}
