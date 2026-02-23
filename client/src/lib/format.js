const suitMap = {
    clubs: '♣',
    diamonds: '♦',
    hearts: '♥',
    spades: '♠',
};
export function cardLabel(card) {
    return `${card.rank}${suitMap[card.suit]}`;
}
export function shortId(id) {
    return id.slice(0, 6);
}
