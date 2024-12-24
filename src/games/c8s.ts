enum Suit {
    hearts,
    spades,
    diamonds,
    clubs,
};
enum Value {
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
enum Facing {
    down,
    up,
    player,
    away_from_player,
}
class Card {
    facing: Facing = Facing.down;
    constructor(public value: Value, public suit: Suit) {}
}
class Pile {
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
type Vector2 = [number, number];
class Grid {
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
class Hand extends Pile {}
class Player {
    constructor(public name: string) {}
}
class PlayerCircle {
    constructor(public players: Player[]) {}

    leftOf(player: Player): Player {
        return this.players[((this.players.indexOf(player) ?? invalid("not in circle")) + 1) % this.players.length]!;
    }
    includes(player: Player): boolean {
        return this.players.includes(player);
    }
}

function regularDeck(): Pile {
    const res = new Pile();
    for(const suit of [Suit.hearts, Suit.spades, Suit.diamonds, Suit.clubs]) {
        for(const value of [Value.ace, Value.two, Value.three, Value.four, Value.five, Value.six, Value.seven, Value.eight, Value.nine, Value.ten, Value.jack, Value.queen, Value.king]) {
            res.add(new Card(value, suit), Facing.down);
        }
    }
    return res;
}

function deal(num_cards_to_deal: number, from_pile: Pile, to_piles: Pile[], facing: Facing): void {
    for(let i = 0; i < num_cards_to_deal; i++) {
        for(const hand of to_piles) {
            const drew_card = from_pile.takeTop() ?? invalid("out of cards to deal"); // if the discard should be reshuffled, have to add that as a hook for on(takeTop from empty)
            hand.add(drew_card, facing);
        }
    } 
}

type C8sState = {
    deck: Pile,
    discard: Pile,
    players: PlayerCircle,
    hands: Map<Player, Hand>,
    spoken_suit?: Suit,
};

type C8sAction = {
    kind: "play_card",
    player: Player,
    card: Card, // (in player's hand)
} | {
    kind: "announce_suit",
    player: Player,
    suit: Suit,
} | {
    kind: "draw_card",
    player: Player,
} | {
    kind: "announce_done",
    player: Player,
};

// given a state and a choice, returns the modified state with the choice applied

function invalid(reason: string): never {
    throw new Error(reason);
}
function c8sCanPlayOn(play_card: Card, on_card: Card, announcement?: Suit): boolean {
    if(play_card.value === Value.eight) return true;
    if(on_card.value === Value.eight) {
        if(play_card.suit === announcement!) return true;
        return false;
    }
    if(play_card.suit === on_card.suit || play_card.value === on_card.value) return true;
    return false;
}
function c8sDraw(state: C8sState): Card | undefined {
    let top = state.deck.takeTop();
    if(top != null) return top;

    const top_of_discard = state.discard.takeTop() ?? invalid("unreachable");
    state.deck.addAll(state.discard.takeAll(), Facing.down);
    state.discard.add(top_of_discard!, top_of_discard.facing);
    state.deck.shuffle();

    top = state.deck.takeTop();
    return top;
}
function* c8sPlayCard(player: Player, state: C8sState, card: Card): Generator<undefined, void, C8sAction> {
    state.discard.add(card, Facing.up);
    if(!c8sCanPlayOn(card, state.discard.peekTop()!, state.spoken_suit)) invalid("can't play that now");
    if(card.value === Value.eight) {
        const action = yield;
        if(action.player === player && action.kind === "announce_suit") {
            state.spoken_suit = action.suit;
            state.discard.once("add", () => state.spoken_suit = undefined); // this really wants to be about a game action, not about the act of adding to the pile
        }else invalid("can't do that now");
    }
}
function* c8sGame(players_in: Player[]): Generator<undefined, Player, C8sAction> {
    // Crazy 8s

    const state: C8sState = {
        deck: regularDeck(),
        discard: new Pile(),
        players: new PlayerCircle(players_in),
        hands: new Map(players_in.map(p => [p, new Hand(p)])),
    };

    const dealer = state.players.players[0] ?? invalid("need a dealer");

    // dealer shuffles
    state.deck.shuffle();
    // dealer deals
    const num_cards_to_deal = [, , 7, 7, 5, 5, 5, 5][state.players.players.length] ?? invalid("cannot play with this many players");
    deal(num_cards_to_deal, state.deck, state.players.players.map(p => state.hands.get(p)!), Facing.player);
    // dealer flips top card
    state.discard.add(state.deck.takeTop()!, Facing.up);

    // play starts to dealer's left
    let player = state.players.leftOf(dealer);
    while(true) {
        // player chooses a card to play or draws a card
        const action = yield;
        if(action.player === player && action.kind === "play_card") {
            yield* c8sPlayCard(player, state, state.hands.get(player)!.take(action.card));
        }else if(action.player === player && action.kind === "draw_card") {
            const newly_drawn = c8sDraw(state);
            const action = yield;
            if(action.player === player && action.kind === "play_card" && action.card === newly_drawn) {
                yield* c8sPlayCard(player, state, newly_drawn);
            }else if(action.player === player && action.kind === "announce_done") {
                if(newly_drawn != null) state.hands.get(player)!.add(newly_drawn, Facing.player);
            }else invalid("can't do that now");
        }else invalid("can't do that now.");

        // win! (this specifies '0 cards at end of your turn = win'. which is fine for crazy 8s, but is interesting
        //         with custom rules added. because maybe a rule lets you play one & then draw one - that wouldn't
        //         count as winning if it was your last. unless we put a hook on hand size changing)
        if(state.hands.get(player)!.cards.length === 0) {
            break;
        }

        // play advances
        player = state.players.leftOf(player);
    }

    // winner!
    return player;
}

type QgState = {
    deck: Pile,
    discard: Pile,
    trash: Pile,
    players: PlayerCircle,
    hands: Map<Player, Hand>,
    infronts: Map<Player, Grid>,
    player: null | Player,
};
type QgAction = {
    kind: "play_cards",
    player: Player,
    cards: Card[],
} | {
    kind: "pick_up_discard",
    player: Player,
} | {
    kind: "choose_top_cards",
    players: {
        player: Player,
        infronts: Card[][],
    }[],
};

function qgNumericValue(card: Card): number {
    switch(card.value) {
        case Value.two: return 0;
        case Value.three: invalid("should not be reachable");
        case Value.four: return 4;
        case Value.five: return 5;
        case Value.six: return 6;
        case Value.seven: return 7;
        case Value.eight: return 8;
        case Value.nine: return 9;
        case Value.ten: invalid("should not be reachable");
        case Value.jack: return 11;
        case Value.queen: return 12;
        case Value.king: return 13;
        case Value.ace: return 14;
        default: invalid("unreachable");
    }
}
function qgCanPlay(state: QgState, add_card: Card): boolean {
    if(add_card.value === Value.two || add_card.value === Value.three || add_card.value === Value.ten) {
        return true;
    }
    // ignore threes
    let i = state.deck.cards.length - 1;
    while(state.deck.cards[i] != null && state.deck.cards[i].value === Value.three) {
        i -= 1;
    }
    const top_card = state.deck.cards[i];
    return qgNumericValue(top_card) <= qgNumericValue(add_card);
}
function qgDrawUpToThree(state: QgState, player: Player): void {
    const hand = state.hands.get(player)!;
    while(hand.cards.length < 3) {
        const drawn_card = state.deck.takeTop();
        if(!drawn_card) break;
        hand.add(drawn_card, Facing.player);
    }
}
function qgPickUpWholePile(state: QgState, player: Player): void {
    state.hands.get(player)!.addAll(state.discard.takeAll(), Facing.player);
}
function qgPlay(state: QgState, cards: Card[]): void {
    if(cards.length < 1) invalid("must play at least one card");
    if(!qgCanPlay(state, cards[0]!)) invalid("you can't play that card");
    if(cards.some(card => card.value !== cards[0]!.value)) invalid("all cards must be same number");

    state.discard.addAll(cards, Facing.up);

    if(
        // 10 clears
        cards[0].value === Value.ten ||
        // four of the same clears
        state.discard.cards.length >= 4 && state.discard.peekTopN(4).every((c, _, a) => c.value === a[0]!.value)
    ) {
        // clear & go again
        state.trash.addAll(state.discard.takeAll(), Facing.down);
    }
}

function* qgGame(players_in: Player[]): Generator<undefined, Player, QgAction> {
    // Quinn's Game
    const infronts_num = 3;
    const state: QgState = {
        deck: regularDeck(),
        discard: new Pile(),
        trash: new Pile(),
        players: new PlayerCircle(players_in),
        hands: new Map(players_in.map(p => [p, new Hand(p)])),
        infronts: new Map(players_in.map(p => [p, new Grid(3, 1)])),
        player: null,
    };
    const dealer = state.players.players[0] ?? invalid("need a dealer");

    // TODO: fix deal order (deal 9 to each player, then each player sets 3 face down and looks at the rest)
    deal(6, state.deck, state.players.players.map(pl => state.hands.get(pl)!), Facing.player);
    deal(1, state.deck, state.players.players.flatMap(pl => state.infronts.get(pl)!.items), Facing.down); // these ones are face down.

    // choose top cards
    const action = yield;
    if(action.kind !== "choose_top_cards") invalid("must choose top cards");
    // apply all topcards
    for(const itm of action.players) {
        if(!state.players.includes(itm.player)) invalid("you're not in the game");
        itm.infronts.forEach((infronts, i) => {
            if(i >= infronts_num) invalid("bad number of infronts");
            for(const infront of infronts) if(!state.hands.get(itm.player)!.includes(infront)) invalid("not your card to place");
            if(!infronts.every(card => card.value === infronts[0]?.value)) invalid("all cards added to the pile must be the same");
            state.infronts.get(itm.player)!.items[i]!.addAll(infronts, Facing.up);
        })
    }
    // validate that all players have chosen topcards
    for(const player of state.players.players) {
        const infronts = state.infronts.get(player)!;
        for(const infront_pile of infronts.items) {
            if(infront_pile.count() <= 1) invalid("must add a card to all of your piles");
        }
    }

    // ready
    state.player = state.players.leftOf(dealer);
    while(true) {
        const action = yield;
        if(action.kind === "play_cards") {
            if(action.player !== state.player!) invalid("not your turn");
            if(action.cards.length < 1) invalid("must play at least one card");

            const hand = state.hands.get(action.player)!;
            const infronts = state.infronts.get(action.player)!;
            if(hand.cards.length === 0) {
                if(infronts.items.every(infront => infront.cards.every(card => card.facing === Facing.down))) {
                    // out of face-ups; playing face-downs
                    if(action.cards.length !== 1) invalid("there is only one face-down card");
                    const card = action.cards[0]!;
                    const target = infronts.items.find(infront => infront.includes(action.cards[0]!)) ?? invalid("that's not one of your face down cards");
                    if(target.cards.length !== 1) invalid("unreachable");
                    target.take(card);
                    if((target.cards.length as number) !== 0) invalid("unreachable");
                    card.facing = Facing.up;
                    
                    if(!qgCanPlay(state, card)) {
                        // sorry about that
                        qgPickUpWholePile(state, action.player);
                        // at least you get to go again!
                        continue;
                    }else{
                        qgPlay(state, [card]);
                    }
                }else{
                    // out of cards; playing face-ups
                    const target = infronts.items.find(infront => infront.includes(action.cards[0]!)) ?? invalid("that's not one of your face up cards");
                    if(action.cards.some(card => card.facing !== Facing.up)) invalid("you can only play your face-up cards now");
                    if(action.cards.length !== target.cards.filter(c => c.facing === Facing.up).length) invalid("you have to play the whole pile at once");

                    qgPlay(state, target.takeAllOf(action.cards))
                }
            }else{
                qgPlay(state, state.hands.get(state.player!)!.takeAllOf(action.cards));
            }
            if(hand.cards.length === 0 && infronts.items.every(infront_pile => infront_pile.cards.length === 0)) {
                // winner
                break;
            }
        }else if(action.kind === "pick_up_discard") {
            if(action.player !== state.player!) invalid("not your turn");
            if(state.hands.get(action.player)!.cards.some(card => qgCanPlay(state, card))) invalid("you must play if you can");
            
            qgPickUpWholePile(state, action.player);
        }else invalid("can't do that right now");

        // draw up to three
        qgDrawUpToThree(state, state.player!);

        // continue to the left (unless you just reset the pile or picked them all up)
        if(state.discard.cards.length > 0) {
            state.player = state.players.leftOf(state.player!);
        }
    }

    // winner!
    return state.player;
}

type GState = {
    deck: Pile,
    discard: Pile,
    players: PlayerCircle,
    grids: Map<Player, Grid>,
};
type GAction = {
    kind: "draw",
    player: Player,
} | {
    kind: "play",
    player: Player,
    take_card: Card,
    replace_card: Card,
} | {
    kind: "discard_drawn",
    player: Player,
};
function gDraw(state: GState): Card {
    let top = state.deck.takeTop();
    if(top != null) return top;

    const top_of_discard = state.discard.takeTop() ?? invalid("unreachable");
    state.deck.addAll(state.discard.takeAll(), Facing.down);
    state.discard.add(top_of_discard!, top_of_discard.facing);
    state.deck.shuffle();

    top = state.deck.takeTop();
    return top ?? invalid("not enough cards in deck");
}
function gCost(value: Value): number {
    switch(value) {
        case Value.ace: return 1;
        case Value.two: return 2;
        case Value.three: return 3;
        case Value.four: return 4;
        case Value.five: return 5;
        case Value.six: return 6;
        case Value.seven: return 7;
        case Value.eight: return 8;
        case Value.nine: return 9;
        case Value.ten: return 10;
        case Value.jack: return 0;
        case Value.queen: return 13;
        case Value.king: return 0;
        default: invalid("unreachable");
    }
}
function* gGame(players_in: Player[]): Generator<undefined, Map<Player, Number>, GAction> {
    // Golf
    const infronts_num = 3;
    const state: GState = {
        deck: regularDeck(),
        discard: new Pile(),
        players: new PlayerCircle(players_in),
        grids: new Map(players_in.map(p => [p, new Grid(4, 2)])),
    };
    const dealer = state.players.players[0] ?? invalid("need a dealer");

    // TODO: fix deal order (deal 8 to each player, then each player assembles their grid)
    deal(1, state.deck, state.players.players.flatMap(pl => state.grids.get(pl)!.items), Facing.down);

    // reveal the top card
    state.discard.add(state.deck.takeTop() ?? invalid("not enough cards in deck"), Facing.up);

    let player = state.players.leftOf(dealer);
    while(true) {
        // check end
        const grid = state.grids.get(player)!;
        if(grid.items.every(itm => itm.cards[0]!.facing === Facing.up)) break;

        let action = yield;
        let take_target: Card;
        if(action.kind === "draw") {
            if(action.player !== player) invalid("not your turn");
            take_target = gDraw(state);

            action = yield;
            if(action.kind === "discard_drawn") {
                if(action.player !== player) invalid("not your turn");
                state.discard.add(take_target, Facing.up);

                player = state.players.leftOf(player);
                continue;
            }
        }else{
            take_target = state.discard.takeTop() ?? invalid("unreachable");
        }
        if(action.kind !== "play") invalid("can't do that");
        if(action.player !== player) invalid("not your turn");
        
        if(action.take_card !== take_target) invalid("you can't take that card");
        let replace_target = grid.findXY(pile => pile.includes(action.replace_card)) ?? invalid("not your grid");
        const replace_pile = grid.get(replace_target) ?? invalid("unreachable");
        state.discard.add(replace_pile.takeTop() ?? invalid("unreachable"), Facing.up);
        replace_pile.add(action.take_card, Facing.up);

        player = state.players.leftOf(player);
    }

    // calculate score
    return new Map<Player, number>(state.players.players.map(pl => {
        const grid = state.grids.get(player)!;
        let prev_col: null | Card[] = null;
        let total = 0;
        for(let x = 0; x < grid.width; x++) {
            const col = Array.from({length: grid.height}, (_, y) => grid.get([x, y])!.cards[0]!);
            if(col.every(card => card.value === col[0]!.value)) {
                // zero. check for dream
                if(prev_col != null && prev_col.every(card => card.value === col[0]!.value)) {
                    // dream!
                    total -= 20;
                    prev_col = null; // no double-dipping a dream if you're playing with multiple decks of cards
                }
            }else{
                total += col.reduce((t, a) => t + gCost(a.value), 0);
            }
            prev_col = col;
        }
        return [pl, total];
    }));
}