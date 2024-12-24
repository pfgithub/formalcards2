import { Card, deal, Facing, Grid, invalid, Pile, Player, PlayerCircle, regularDeck, Value } from "../lib";

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

    state.deck.shuffle();
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
