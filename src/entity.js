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
    resetToSpawn(){
        this.pos={...this.ogPos};
        this.vel=v();
        this.followingPlayer=undefined;
        this.targetedDoor=undefined;
        this.positionUnlocked=false;
    }
    touchesPlayer(player){
        if(!this.playerAllowed(player)||player.dead||player.unloading||!player.body) return false;
        const current=player.body.position,previous=player.body.positionPrev||current;
        const dx=current.x-previous.x,dy=current.y-previous.y,lengthSquared=(dx*dx)+(dy*dy);
        const progress=lengthSquared?Math.max(0,Math.min(1,(((this.pos.x-previous.x)*dx)+((this.pos.y-previous.y)*dy))/lengthSquared)):0;
        const closest=v(previous.x+(dx*progress),previous.y+(dy*progress));
        return getDst(closest,this.pos)<Math.max(48,58*player.scale);
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
                if(!this.playerAllowed(this.followingPlayer)){ this.resetToSpawn(); return; }
                const newPos = v(this.followingPlayer.body.position.x,this.followingPlayer.body.position.y-(45*this.followingPlayer.scale));
                const rawDst = getDst(newPos, this.pos);
                const pull=rawDst>140?.72:.42;
                this.pos.x+=(newPos.x-this.pos.x)*pull;
                this.pos.y+=(newPos.y-this.pos.y)*pull;
                this.vel.x=this.followingPlayer.body.velocity.x*.25;
                this.vel.y=this.followingPlayer.body.velocity.y*.25;
            } else {
                const rawDst = getDst(this.ogPos, this.pos);
                const dst = Math.min(Math.pow(rawDst,1.2)*0.02, 0.4);
                const angle = -getAngle(this.ogPos, this.pos)+(Math.PI*0.5);
                this.vel.x += Math.cos(angle)*dst;
                this.vel.y += Math.sin(angle)*dst;
                this.game.players.forEach(e=>{
                    if(!this.followingPlayer&&this.touchesPlayer(e)){ this.positionUnlocked=true; this.followingPlayer=e; }
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
