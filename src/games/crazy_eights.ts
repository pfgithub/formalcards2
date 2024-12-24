import { Card, deal, Facing, Hand, invalid, Pile, Player, PlayerCircle, regularDeck, Suit, Value } from "../lib";


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
function* c8sGame(players_in: PlayerCircle): Generator<undefined, Player, C8sAction> {
    // Crazy 8s

    const state: C8sState = {
        deck: regularDeck(),
        discard: new Pile(),
        players: players_in,
        hands: new Map(players_in.players.map(p => [p, new Hand(p)])),
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
