export enum Suit {
    hearts,
    spades,
    diamonds,
    clubs,
};
export enum Value {
    ace,
    two,
    three,
    four,
    five,
    six,
    seven,
    eight,
    nine,
    ten,
    jack,
    queen,
    king,
}
export enum Facing {
    down,
    up,
    player,
    away_from_player,
}
export class Card {
    facing: Facing = Facing.down;
    constructor(public value: Value, public suit: Suit) {}
}
export class Pile {
    cards: Card[] = [];
    onceAdd: (() => void)[] = [];
    constructor(public up_side_visible_to: "all" | Player = "all") {}
    _addMany(cards: Card[]) {
        this.cards = [...this.cards, ...cards];
        this.emitAdd();
    }
    // can make .addable().add where .addable() returns an Addable of (Pile, _addMany)
    // can't make eg `implements Addable` and have it auto add the add, addMany fns
    // what's even the point of oop if you have to do things the zig way in the end anyway
    add(card: Card, facing: Facing): void {
        card.facing = facing;
        this._addMany([card]);
    }
    addAll(cards: Card[], facing: Facing): void {
        for(const card of cards) card.facing = facing;
        this._addMany(cards);
    }
    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }
    take(card: Card): Card {
        const idx = this.cards.indexOf(card);
        if(idx === -1) invalid("card not in pile");
        return this.cards.splice(idx, 1)[0];
    }
    takeAllOf(cards: Card[]): Card[] {
        return cards.map(card => this.take(card));
    }
    peekTop() {
        return this.cards[this.cards.length - 1];
    }
    peekTopN(n: number) {
        return this.cards.slice(-n);
    }
    takeTop() {
        return this.cards.pop();
    }
    takeAll() {
        const res = this.cards;
        this.cards = [];
        return res;
    }
    includes(card: Card): boolean {
        return this.cards.includes(card);
    }
    includesAllOf(card: Set<Card>): boolean {
        return [...card].every(card => this.includes(card));
    }
    once(ev: "add", cb: () => void) {
        this.onceAdd.push(cb);
    }
    emitAdd() {
        const cbs = this.onceAdd;
        this.onceAdd = [];
        for(const cb of cbs) cb();
    }
    count() {
        return this.cards.length;
    }
}
export type Vector2 = [number, number];
export class Grid {
    items: Pile[];
    constructor(public width: number, public height: number) {
        this.items = Array.from({length: width * height}, () => new Pile());
    }
    indexToXY(index: number): Vector2 {
        const resh = Math.floor(index / this.height);
        const resw = index - resh * this.width;
        return [resw, resh];
    }
    xyToIndex(pos: Vector2): number | null {
        if(pos[0] < 0 || pos[1] < 0 || pos[0] >= this.width || pos[1] >= this.height) return null;
        return pos[1] * this.width + pos[0];
    }
    findXY(cb: (pile: Pile, pos: Vector2) => boolean): Vector2 | null {
        for(let i = 0; i < this.items.length; i++) {
            if(cb(this.items[i], this.indexToXY(i))) return this.indexToXY(i);
        }
        return null;
    }
    get(pos: Vector2): Pile | null {
        const idx = this.xyToIndex(pos);
        if(idx == null) return null;
        return this.items[idx];
    }
}
export class Hand extends Pile {}
export class Player {
    constructor(public name: string) {}
}
export class PlayerCircle {
    constructor(public players: Player[]) {}

    leftOf(player: Player): Player {
        const idx = this.players.indexOf(player);
        if(idx === -1) invalid("not in circle");
        return this.players[((idx) + 1) % this.players.length]!;
    }
    leftOfExcluding(player: Player, excluding: Set<Player>): Player {
        if(this.players.every(player => excluding.has(player))) invalid("all players excluded");
        let res = player;
        do{
            res = this.leftOf(res);
        }while(!excluding.has(player));
        return res;
    }
    includes(player: Player): boolean {
        return this.players.includes(player);
    }
    oppositeOf(player: Player): Player {
        const idx = this.players.indexOf(player);
        if(idx === -1) invalid("not in circle");
        if(this.players.length % 2 !== 0) invalid("must have even # players");
        const half = Math.floor(this.players.length / 2);
        return this.players[idx < half ? idx + half : idx - half];
    }
}

export function regularDeck(): Pile {
    const res = new Pile();
    for(const suit of [Suit.hearts, Suit.spades, Suit.diamonds, Suit.clubs]) {
        for(const value of [Value.ace, Value.two, Value.three, Value.four, Value.five, Value.six, Value.seven, Value.eight, Value.nine, Value.ten, Value.jack, Value.queen, Value.king]) {
            res.add(new Card(value, suit), Facing.down);
        }
    }
    return res;
}
export function pinochleDeck(): Pile {
    const res = new Pile();
    for(let i = 0; i < 2; i++) {
        for(const suit of [Suit.hearts, Suit.spades, Suit.diamonds, Suit.clubs]) {
            for(const value of [Value.nine, Value.jack, Value.queen, Value.king, Value.ten, Value.ace]) {
                res.add(new Card(value, suit), Facing.down);
            }
        }
    }
    return res;
}

export function deal(num_cards_to_deal: number, from_pile: Pile, to_piles: Pile[], facing: Facing): void {
    for(let i = 0; i < num_cards_to_deal; i++) {
        for(const hand of to_piles) {
            const drew_card = from_pile.takeTop() ?? invalid("out of cards to deal"); // if the discard should be reshuffled, have to add that as a hook for on(takeTop from empty)
            hand.add(drew_card, facing);
        }
    } 
}
export function invalid(reason: string): never {
    throw new Error(reason);
}