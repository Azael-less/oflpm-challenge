// api/players.js
// Lista de jugadores del reto OFLPM y la región donde juegan.
//
// Para pasar a NA más adelante: cambia PLATFORM a "na1"
// (REGIONAL se queda en "americas", ya cubre LAN y NA).
//
// "label" es el nombre que se muestra en la tarjeta si quieres que
// sea distinto al gameName real (opcional).
// "goalTier" define la meta personal. Valores: IRON, BRONZE, SILVER,
// GOLD, PLATINUM, EMERALD, DIAMOND, MASTER, GRANDMASTER o CHALLENGER.

const PLATFORM = "la1"; // LAN. Cuando migren a NA: "na1"
const REGIONAL = "americas"; // ruta regional para Account-v1 (LAN y NA usan "americas")

const PLAYERS = [
  { gameName: "akang", tagLine: "lan", goalTier: "DIAMOND", startRank: { tier: "EMERALD", rank: "IV", leaguePoints: 16 } },
  { gameName: "bigenius", tagLine: "lan", goalTier: "MASTER", startRank: { tier: "EMERALD", rank: "II", leaguePoints: 81 } },
  { gameName: "Sopa e Mojarra", tagLine: "lan", goalTier: "DIAMOND", startRank: { tier: "PLATINUM", rank: "III", leaguePoints: 10 } },
  { gameName: "JUNIOR ES", tagLine: "LAN", goalTier: "PLATINUM", startRank: { tier: "SILVER", rank: "II", leaguePoints: 91 } },
  { gameName: "Azael less", tagLine: "少ない", goalTier: "MASTER", startRank: { tier: "EMERALD", rank: "I", leaguePoints: 25 } },
  { gameName: "CCR Loki4Carry", tagLine: "CCR", goalTier: "DIAMOND", startRank: { tier: "PLATINUM", rank: "I", leaguePoints: 51 } },
];

module.exports = { PLAYERS, PLATFORM, REGIONAL };
