import { Card, deal, Facing, Grid, Hand, invalid, Pile, Player, PlayerCircle, regularDeck, Value } from "../lib";

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

const qgCardOrder = [Value.four, Value.five, Value.six, Value.seven, Value.eight, Value.nine, Value.jack, Value.queen, Value.king, Value.ace];

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
    return qgCardOrder.indexOf(top_card.value) <= qgCardOrder.indexOf(add_card.value);
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

function* qgGame(players_in: PlayerCircle): Generator<undefined, Player, QgAction> {
    // Quinn's Game
    const infronts_num = 3;
    const state: QgState = {
        deck: regularDeck(),
        discard: new Pile(),
        trash: new Pile(),
        players: players_in,
        hands: new Map(players_in.players.map(p => [p, new Hand(p)])),
        infronts: new Map(players_in.players.map(p => [p, new Grid(3, 1)])),
        player: null,
    };
    const dealer = state.players.players[0] ?? invalid("need a dealer");

    state.deck.shuffle();

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
