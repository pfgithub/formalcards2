import { Card, deal, Facing, Hand, invalid, Pile, pinochleDeck, Player, PlayerCircle, Suit, Value } from "../lib";

type State = {
    deck: Pile,
    players: PlayerCircle,
    hands: Map<Player, Hand>,
    in_play: Pile,
    t1_winnings: Pile,
    t2_winnings: Pile,

    bid?: number,
    trump?: Suit,
    passed: Set<Player>,
};
type Action = {
    kind: "bid",
    player: Player,
    bid: number,
} | {
    kind: "pass_bid",
    player: Player,
} | {
    kind: "choose_trump",
    player: Player,
    suit: Suit,
} | {
    kind: "pass_cards",
    p1: Player,
    p1_cards: Card[],
    p2: Player,
    p2_cards: Card[],
} | {
    kind: "invoke_lawrence_rule",
    player: Player,
} | {
    kind: "reveal_meld",
    melds: Map<Player, Set<Card>>,
} | {
    kind: "play_card",
    player: Player,
    card: Card,
};

function scoreHasEvery(meld: Set<Card>, has: [Value, Suit][], score: number, double_score: number): number {
    let single_count = 0;
    let double_count = 0;
    for(const itm of has) {
        const c = [...meld].filter(c => c.suit === itm[1] && c.value === itm[0]);
        if(c.length >= 1) single_count += 1;
        if(c.length >= 2) double_count += 1;
    }
    if(double_count === has.length) return double_score;
    if(single_count === has.length) return score;
    return 0;
}
const suits = [Suit.hearts, Suit.spades, Suit.diamonds, Suit.clubs];
function scoreNAround(meld: Set<Card>, value: Value, score: number, double_score: number): number {
    return scoreHasEvery(meld, suits.map(suit => [value, suit]), score, double_score);
}
function scoreRun(meld: Set<Card>, trump: Suit, score: number, double_score: number): number {
    const run_cards = [Value.jack, Value.queen, Value.king, Value.ten, Value.ace];
    return scoreHasEvery(meld, run_cards.map(rc => [rc, trump]), score, double_score);
}
function scoreMeld(trump: Suit, meld: Set<Card>): number {
    // kq of trump, not in run = 4
    // kq = 2

    let score = 0;
    score += scoreRun(meld, trump, 15 - 4, 150 - 8); // (double)? run (subtract 4 because marriages are counted below even if in a run)
    score += scoreNAround(meld, Value.ace, 10, 100); // (double)? aces around
    score += scoreNAround(meld, Value.king, 8, 80); // (double)? kings around
    score += scoreNAround(meld, Value.queen, 6, 60); // (double)? queens around
    score += scoreNAround(meld, Value.jack, 4, 40); // (double)? jacks around
    score += [...meld].filter(c => c.suit === trump && c.value === Value.nine).length; // nines of trump
    score += scoreHasEvery(meld, [[Value.jack, Suit.diamonds], [Value.queen, Suit.spades]], 4, 30); // (double)? pinochle
    for(const suit of suits) {
        score += scoreHasEvery(meld, [[Value.king, suit], [Value.queen, suit]], suit === trump ? 4 : 2, suit === trump ? 8 : 4);
    }

    return score;
}

function* game(players_in: PlayerCircle): Generator<undefined, void, Action> {
    // Crazy 8s
    if(players_in.players.length !== 4) invalid("need 4 players");

    const state: State = {
        deck: pinochleDeck(),
        players: players_in,
        hands: new Map(players_in.players.map(p => [p, new Hand(p)])),
        in_play: new Pile(),

        t1_winnings: new Pile(),
        t2_winnings: new Pile(),

        passed: new Set(),
    };

    const deck = pinochleDeck();

    const dealer = state.players.players[0] ?? invalid("need a dealer");

    // dealer shuffles
    state.deck.shuffle();
    // dealer deals
    deal(12, state.deck, state.players.players.map(p => state.hands.get(p)!), Facing.player);

    // bidding starts
    let bidder = state.players.leftOf(dealer);
    while(true) {
        const action = yield;
        if(action.kind === "bid") {
            if(action.player !== bidder) invalid("not your turn");
            if(state.bid == null) {
                if(action.bid < 20) invalid("must start at at least 20");
            }else{
                if(action.bid <= state.bid) invalid("must increase bid");
            }
            state.bid = action.bid;
        }else if(action.kind === "pass_bid") {
            if(action.player !== bidder) invalid("not your turn");
            state.passed.add(action.player);
        }else invalid("can't do that now")

        if(state.passed.size - 1 === state.players.players.length) break; // done bidding
        bidder = state.players.leftOfExcluding(bidder, state.passed);
    }
    if(state.bid == null) state.bid = 20; // no one bid; last player gets it for 20

    {
        const action = yield;
        if(action.kind !== "choose_trump") invalid("must choose trump");
        if(action.player !== bidder) invalid("you didn't win the bid");
        state.trump = action.suit;
    }
    {
        const action = yield;
        if(action.kind === "invoke_lawrence_rule") {
            invalid("TODO implement");
        }
        if(action.kind !== "pass_cards") invalid("must pass cards");
        const p1 = bidder;
        const p2 = state.players.oppositeOf(p1);
        if(action.p1 !== p1) invalid("you didn't win the bid");
        if(action.p2 !== p2) invalid("you teammate didn't win the bid");
        if(action.p1_cards.length !== 3) invalid("must pass three cards");
        if(action.p2_cards.length !== 3) invalid("must pass three cards");
        const take_p1 = state.hands.get(p1)!.takeAllOf(action.p1_cards);
        const take_p2 = state.hands.get(p1)!.takeAllOf(action.p2_cards);
        state.hands.get(p1)!.addAll(take_p2, Facing.player);
        state.hands.get(p2)!.addAll(take_p1, Facing.player);
    }
    {
        const action = yield;
        if(action.kind !== "reveal_meld") invalid("must reveal meld");
        if(action.melds.size > state.players.players.length) invalid("you're not in the game");
        // reveal melds
        for(const player of state.players.players) {
            const meld = action.melds.get(player) ?? invalid("you have to meld, even if it's 0 cards");
            for(const card of meld) card.facing = Facing.up;
        }
        // count score
        for(const player of state.players.players) {
            const meld = action.melds.get(player)!;
            scoreMeld(state.trump, meld);
        }
        // hide melds
        for(const player of state.players.players) {
            const meld = action.melds.get(player)!;
            for(const card of meld) card.facing = Facing.player;
        }
    }
    // play
    let leader = bidder;
    while(true) {
        // leader plays a card
        const action = yield;
        if(action.kind !== "play_card") invalid("can't do that now");
        if(action.player !== leader) invalid("not your turn");
        state.in_play.add(state.hands.get(action.player)!.take(action.card), Facing.up);
        // 3 more ppl play cards
        let player = leader;
        do {
            player = state.players.leftOf(leader);

            const action = yield;
            if(action.kind !== "play_card") invalid("can't do that now");
            if(action.player !== player) invalid("not your turn");
            // TODO:
            // -> if has suit, must follow suit
            //     - if can beat, must (= have to play a higher card unless trump was played)
            // -> if has trump, must trump
            //     - if can beat, must (= have to play a higher trump if a trump has been played)
            // -> may play any card
            if((true)) invalid("TODO validate card");
            state.in_play.add(state.hands.get(action.player)!.take(action.card), Facing.up);
        }while(player != leader);

        // cards are given to the stack & next leader is chosen

        if((true)) invalid("TODO choose next leader");
    }

    // TODO: allow late counting of a forgotten 9 during melding (nothing else though)

    // count score
    // ace, ten, king = +1, else = +0
    // 0 points = don't keep your meld (even if you took a trick)
    if((true)) invalid("TODO count score");
}