(() => {
  const CFG = window.OFLPM_CONFIG;
  const board = document.getElementById("board");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const updatedAtEl = document.getElementById("updated-at");
  const countdownEl = document.getElementById("countdown");
  const errorBox = document.getElementById("error-box");
  const refreshBtn = document.getElementById("refresh-btn");
  const modal = document.getElementById("player-modal");
  const modalClose = document.getElementById("modal-close");
  const modalTitle = document.getElementById("modal-title");
  const modalSubtitle = document.getElementById("modal-subtitle");
  const modalOpgg = document.getElementById("modal-opgg");
  const modalBody = document.getElementById("modal-body");
  const awardsGrid = document.getElementById("awards-grid");
  const awardsDescription = document.getElementById("awards-description");
  const leaderboardView = document.getElementById("leaderboard-view");
  const awardsView = document.getElementById("awards-view");
  const viewTabs = document.querySelectorAll(".view-tab");
  const boardTitle = document.getElementById("board-title");
  const boardKicker = document.getElementById("board-kicker");
  const boardDescription = document.getElementById("board-description");

  const TIER_LABELS = {
    IRON: "Hierro",
    BRONZE: "Bronce",
    SILVER: "Plata",
    GOLD: "Oro",
    PLATINUM: "Platino",
    EMERALD: "Esmeralda",
    DIAMOND: "Diamante",
    MASTER: "Maestro",
    GRANDMASTER: "Gran Maestro",
    CHALLENGER: "Retador",
  };
  const APEX = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
  const TIER_PROGRESS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
  const DIVISION_PROGRESS = { IV: 0, III: 0.25, II: 0.5, I: 0.75 };

  let nextUpdateAt = null;
  let countdownTimer = null;
  let currentPlayers = [];
  let currentBoardMode = "progress";

  function tierClass(tier) {
    return `tier-${(tier || "").toLowerCase()}`;
  }

  function lpTrendKey(player) {
    return `oflpm_lp_${player.gameName}_${player.tagLine}`;
  }

  function computeTrend(player) {
    if (!player.ranked) return null;
    const key = lpTrendKey(player);
    const prev = localStorage.getItem(key);
    const current = player.ranked.leaguePoints;
    localStorage.setItem(key, String(current));
    if (prev === null) return null;
    const diff = current - Number(prev);
    if (diff === 0) return null;
    return diff;
  }

  function getTierIconPath(tier) {
    const normalized = (tier || "IRON").toUpperCase();
    const files = {
      IRON: "Iron.png",
      BRONZE: "Bronze.png",
      SILVER: "Silver.png",
      GOLD: "Gold.png",
      PLATINUM: "Platinum.png",
      EMERALD: "Emerald.png",
      DIAMOND: "Diamond.png",
      MASTER: "Master.png",
      GRANDMASTER: "Grandmaster.png",
      CHALLENGER: "Challenger.png",
    };
    return `/api/icons/${files[normalized] || "Unranked.png"}`;
  }

  function getChampionIconUrl(player, championName) {
    const versionMatch = (player.profileIconUrl || "").match(/\/cdn\/([^/]+)\//);
    const version = versionMatch ? versionMatch[1] : "14.1.1";
    const aliases = { "Kai'Sa": "Kaisa", "Cho'Gath": "Chogath", "Kha'Zix": "Khazix", "Vel'Koz": "Velkoz", "Rek'Sai": "RekSai", "Bel'Veth": "Belveth" };
    const championId = aliases[championName] || String(championName || "").replace(/[^a-zA-Z0-9]/g, "");
    return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championId}.png`;
  }
  function rankValue(rank) {
    if (!rank) return 0;
    const tierIndex = Math.max(0, TIER_PROGRESS.indexOf((rank.tier || "IRON").toUpperCase()));
    const divisionOffset = APEX.has((rank.tier || "").toUpperCase()) ? 0 : (DIVISION_PROGRESS[rank.rank] || 0);
    return tierIndex * 400 + divisionOffset * 400 + Math.max(0, Math.min(100, rank.leaguePoints || 0));
  }

  function getContestProgress(player) {
    if (!player.startRank || !player.goalTier || !player.ranked) return null;
    const start = rankValue(player.startRank);
    const goal = rankValue({ tier: player.goalTier, rank: "IV", leaguePoints: 0 });
    const current = rankValue(player.ranked);
    if (goal <= start) return null;
    return Math.max(0, Math.min(1, (current - start) / (goal - start)));
  }

  function getCurrentRankScore(player) {
    return rankValue(player.ranked);
  }
  function getGoalRoute(player) {
    const goalTier = (player.goalTier || "").toUpperCase();
    const goalIndex = TIER_PROGRESS.indexOf(goalTier);
    if (goalIndex === -1) return null;

    const currentTier = (player.ranked?.tier || "IRON").toUpperCase();
    const currentIndex = Math.max(0, TIER_PROGRESS.indexOf(currentTier));
    const currentDivision = APEX.has(currentTier) ? null : (player.ranked?.rank || "IV");
    const currentLp = Math.max(0, Math.min(100, player.ranked?.leaguePoints || 0));
    const currentLabel = `${TIER_LABELS[currentTier] || currentTier}${currentDivision ? ` ${currentDivision}` : ""}`;

    if (currentIndex >= goalIndex) {
      return { goalTier, currentLabel, steps: [], complete: true };
    }

    const divisions = ["IV", "III", "II", "I"];
    const steps = [];
    for (let tierIndex = currentIndex; tierIndex < goalIndex; tierIndex += 1) {
      const tier = TIER_PROGRESS[tierIndex];
      if (APEX.has(tier)) continue;
      const firstDivision = tierIndex === currentIndex
        ? Math.max(0, divisions.indexOf(currentDivision || "IV"))
        : 0;

      for (let divisionIndex = firstDivision; divisionIndex < divisions.length; divisionIndex += 1) {
        steps.push({
          label: `${TIER_LABELS[tier]} ${divisions[divisionIndex]}`,
          fill: tierIndex === currentIndex && divisionIndex === firstDivision ? currentLp : 0,
          leagueStart: divisionIndex === 0,
        });
      }
    }
    return { goalTier, currentLabel, steps, complete: false };
  }

  function getGoalMarkup(player) {
    const route = getGoalRoute(player);
    if (!route) return '';

    const goalLabel = TIER_LABELS[route.goalTier] || route.goalTier;
    if (route.complete) {
      return `<span class="goal-progress goal-complete" aria-label="Meta cumplida: ${goalLabel}"><span class="goal-track"><span class="goal-segment"><span style="width: 100%"></span></span></span><span class="goal-target"><img src="${getTierIconPath(route.goalTier)}" alt="Meta cumplida: ${goalLabel}" /></span></span>`;
    }

    const visibleSteps = route.steps.slice(0, 10);
    const segments = visibleSteps.map((step) => `<span class="goal-segment${step.leagueStart ? " league-start" : ""}" aria-label="${step.label}"><span style="width: ${step.fill}%"></span></span>`).join("");
    return `<span class="goal-progress" aria-label="Ruta desde ${route.currentLabel} hacia ${goalLabel}"><span class="goal-track">${segments}</span><span class="goal-target"><img src="${getTierIconPath(route.goalTier)}" alt="Meta: ${goalLabel}" /></span></span>`;
  }
  function getTierBadgeMarkup(tier) {
    const normalized = (tier || "IRON").toUpperCase();
    const label = TIER_LABELS[normalized] || "Sin clasificar";
    return `<span class="tier-badge tier-badge--${normalized.toLowerCase()}" title="${label}"><img src="${getTierIconPath(tier)}" alt="${label}" /></span>`;
  }

  function renderRow(player, index) {
    const rank = index + 1;
    const topClass = rank === 1 ? "top1" : rank === 2 ? "top2" : rank === 3 ? "top3" : "";
    const trend = computeTrend(player);
    const goalHtml = getGoalMarkup(player);

    let tierHtml = `<span class="unranked">Sin clasificar</span>`;
    let lpHtml = `<span class="lp">—</span>`;
    let recordHtml = `<span class="record">Sin partidas</span>`;

    if (player.ranked) {
      const { tier, rank: division, leaguePoints, wins, losses, hotStreak } = player.ranked;
      const label = TIER_LABELS[tier] || tier;
      const divisionLabel = APEX.has(tier) ? "" : ` ${division}`;
      tierHtml = `
        ${getTierBadgeMarkup(tier)}
        <span class="tier-label">${label}${divisionLabel}</span>
        ${hotStreak ? '<span class="hotstreak">RACHA</span>' : ""}
      `;

      const trendHtml = trend
        ? `<span class="lp-trend ${trend > 0 ? "up" : "down"}">${trend > 0 ? "▲" : "▼"}${Math.abs(trend)}</span>`
        : "";
      lpHtml = `<span class="lp">${leaguePoints} LP</span>${trendHtml}`;

      const total = wins + losses;
      const winrate = total ? Math.round((wins / total) * 100) : 0;
      recordHtml = `<span class="record"><span class="w">${wins}G</span> · <span class="l">${losses}P</span> <span class="winrate">${winrate}%</span></span>`;
    }

    const row = document.createElement("article");
    row.className = `row ${topClass}`;
    row.style.animationDelay = `${index * 45}ms`;
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.innerHTML = `
      <span class="rank-num">${rank}</span>
      <span class="player">
        <img class="player-icon" src="${player.profileIconUrl}" alt="" loading="lazy" />
        <span class="player-names">
          <span class="player-name">${player.label || player.gameName}</span>
          <span class="player-tag">#${player.tagLine}</span>
        </span>
      </span>
      <span class="tier">${tierHtml}</span>
      <span>${lpHtml}</span>
      <span>${recordHtml}</span>
      ${goalHtml}
    `;

    row.addEventListener("click", () => openPlayerModal(player));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPlayerModal(player);
      }
    });

    return row;
  }

  function renderBoard() {
    const players = [...currentPlayers];
    const isProgress = currentBoardMode === "progress";
    const ordered = isProgress
      ? players.sort((a, b) => (getContestProgress(b) ?? -1) - (getContestProgress(a) ?? -1))
      : players.sort((a, b) => getCurrentRankScore(b) - getCurrentRankScore(a));
    const highestProgress = Math.max(...ordered.map((player) => getContestProgress(player) ?? 0));
    const showPodium = isProgress && highestProgress > 0;

    board.innerHTML = "";
    ordered.forEach((player, index) => {
      const li = document.createElement("li");
      li.appendChild(renderRow(player, index, showPodium));
      board.appendChild(li);
    });
  }

  function render(players) {
    currentPlayers = players;
    renderAwards(players);
    renderBoard();
  }

  function renderAwards(players) {
    const awardStats = (player) => player.awardStats || player.stats || {};
    const periodStatus = players.find((player) => player.awardStats)?.awardStats?.periodStatus;
    if (awardsDescription) {
      awardsDescription.textContent = periodStatus === "preview"
        ? "Vista previa: últimas 8 partidas de cada jugador."
        : "Partidas del reto: 30 de julio a 30 de agosto (hora Colombia).";
    }

    const playersWithStats = players.filter((player) => awardStats(player).matchesPlayed > 0);
    if (!playersWithStats.length) {
      awardsGrid.innerHTML = '<p class="error-box">Aún no hay partidas registradas para el periodo del reto.</p>';
      return;
    }

    const champion = (player) => awardStats(player).otpChampion;
    const otpScore = (player) => {
      const otp = champion(player);
      return otp ? otp.games * (otp.winRate / 100) : 0;
    };
    const awards = [
      { label: "Rey del pentakill", symbol: "♛", unit: "pentakills", value: (p) => awardStats(p).pentakills || 0, detail: () => "Instinto de ejecución en las partidas recientes.", modalDetail: (p) => `${awardStats(p).pentakills || 0} pentakills en ${awardStats(p).matchesPlayed} partidas.` },
      { label: "Maestro de la cuadra", symbol: "✦", unit: "cuadras", value: (p) => awardStats(p).quadras || 0, detail: () => "A un paso de borrar al equipo rival.", modalDetail: (p) => `${awardStats(p).quadras || 0} cuadras registradas en la vista previa.` },
      { label: "Mayor soporte", symbol: "+", unit: "asistencias", value: (p) => awardStats(p).assists || 0, detail: () => "Más asistencias acumuladas en las partidas recientes.", modalDetail: (p) => `${awardStats(p).assists || 0} asistencias: impacto directo en las jugadas del equipo.` },
      { label: "Racha imparable", symbol: "↑", unit: "victorias", value: (p) => awardStats(p).longestWinStreak || 0, detail: () => "Mayor cadena de victorias recientes.", modalDetail: (p) => `Su mejor racha fue de ${awardStats(p).longestWinStreak || 0} victorias seguidas.` },
      { label: "El que más sufrió", symbol: "↓", unit: "derrotas", value: (p) => awardStats(p).longestLossStreak || 0, detail: () => "Mayor racha de derrotas; la remontada empieza aquí.", modalDetail: (p) => `La racha más difícil fue de ${awardStats(p).longestLossStreak || 0} derrotas seguidas.` },
      { label: "Champion pool dorado", symbol: "◇", unit: "campeones", value: (p) => (awardStats(p).goodWinrateChampions || []).length, detail: (p) => `${(awardStats(p).goodWinrateChampions || []).map((c) => c.name).join(", ") || "Aún sin dos partidas por campeón."}`, modalDetail: (p) => `Campeones con buen win rate: ${(awardStats(p).goodWinrateChampions || []).map((c) => c.name).join(", ") || "sin registros suficientes"}.` },
      { label: "Mejor OTP", symbol: "◆", unit: "partidas", value: (p) => champion(p)?.games || 0, score: otpScore, detail: (p) => { const c = champion(p); return c ? `${c.name} · ${c.games} partidas · ${c.winRate}% WR` : "Aún sin campeón recurrente."; }, modalDetail: (p) => { const c = champion(p); return c ? `${c.name}: ${c.games} partidas y ${c.winRate}% de win rate.` : "Sin datos suficientes."; } },
    ];

    awardsGrid.innerHTML = "";
    awards.forEach((award) => {
      const ranking = [...playersWithStats].sort((a, b) => (award.score ? award.score(b) : award.value(b)) - (award.score ? award.score(a) : award.value(a)));
      const winner = ranking[0];
      const card = document.createElement("button");
      card.type = "button";
      card.className = "award-card";
      card.dataset.symbol = award.symbol;
      card.innerHTML = `<span class="award-emblem">${award.symbol}</span><img class="award-player-icon" src="${winner.profileIconUrl}" alt="" loading="lazy" /><span class="award-content"><span class="award-label">${award.label}</span><span class="award-player">${winner.label || winner.gameName}</span><span class="award-tag">#${winner.tagLine}</span><span class="award-detail">${award.detail(winner)}</span></span><span class="award-value">${award.value(winner)}<small>${award.unit}</small></span>`;
      card.addEventListener("click", () => openAwardModal({ ...award, winner }, ranking));
      awardsGrid.appendChild(card);
    });
  }

  function openAwardModal(award, ranking) {
    const winner = award.winner;
    modalTitle.textContent = award.label;
    modalSubtitle.textContent = "Resultado de la vista previa";
    modalOpgg.href = winner.opggUrl;
    modalOpgg.textContent = "Perfil del ganador";

    const podium = ranking.map((player, index) => `
      <button class="award-podium-row ${index < 3 ? `award-place-${index + 1}` : ""}" type="button">
        <span class="award-place">${index + 1}</span>
        <img src="${player.profileIconUrl}" alt="" loading="lazy" />
        <span class="award-podium-player"><strong>${player.label || player.gameName}</strong><span>#${player.tagLine}</span></span>
        <span class="award-podium-value">${award.value(player)} <small>${award.unit}</small></span>
      </button>
    `).join("");

    modalBody.innerHTML = `
      <section class="award-modal-hero" data-symbol="${award.symbol}">
        <span class="award-modal-symbol">${award.symbol}</span>
        <img src="${winner.profileIconUrl}" alt="" />
        <div><span class="section-kicker">Ganador actual</span><strong>${winner.label || winner.gameName}</strong><p>${award.modalDetail(winner)}</p></div>
        <div class="award-modal-score"><strong>${award.value(winner)}</strong><span>${award.unit}</span></div>
      </section>
      <section class="modal-section award-podium-section">
        <div class="modal-section-title"><span>Podio del reto</span><small>Posición por ${award.label.toLowerCase()}</small></div>
        <div class="award-podium-list">${podium}</div>
      </section>
    `;
    modalBody.querySelectorAll(".award-podium-row").forEach((row, index) => row.addEventListener("click", () => openPlayerModal(ranking[index])));
    modal.hidden = false;
  }
  function switchView(viewName) {
    const awardsActive = viewName === "awards";
    leaderboardView.hidden = awardsActive;
    awardsView.hidden = !awardsActive;

    if (!awardsActive) {
      currentBoardMode = viewName;
      const isProgress = viewName === "progress";
      boardKicker.textContent = isProgress ? "Carrera personal" : "Escalera competitiva";
      boardTitle.textContent = isProgress ? "Progreso del reto" : "Ranking actual";
      boardDescription.textContent = isProgress
        ? "Ordenado por avance desde el punto de partida hacia la meta personal."
        : "Ordenado por rango y LP actuales; no representa el progreso del reto.";
      renderBoard();
    }

    viewTabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === viewName));
  }
  function openPlayerModal(player) {
    if (!player) return;
    modalTitle.textContent = player.label || player.gameName;
    modalSubtitle.textContent = "Ficha competitiva del reto";
    modalOpgg.href = player.opggUrl;

    const stats = player.stats || {};
    const championEntries = (stats.championEntries || []).slice(0, 4);
    const championMarkup = championEntries.length
      ? championEntries.map((entry) => `
          <div class="champion-item">
            <img class="champion-icon" src="${getChampionIconUrl(player, entry.name)}" alt="${entry.name}" loading="lazy" />
            <div class="champion-copy">
              <strong>${entry.name}</strong>
              <span>${entry.games} partidas · ${entry.winRate}% WR</span>
            </div>
            <span class="champion-record">${entry.wins}V · ${entry.losses}D</span>
          </div>
        `).join("")
      : '<div class="champion-item"><strong>Sin datos recientes</strong></div>';

    const recentMatches = (stats.recentMatches || []).slice(0, 8);
    const matchMarkup = recentMatches.length
      ? recentMatches.map((match) => `
          <article class="match-card ${match.win ? "match-win" : "match-loss"}">
            <img class="match-champion-icon" src="${match.championIconUrl}" alt="${match.champion}" loading="lazy" />
            <div class="match-champion"><strong>${match.champion}</strong><span>${match.queue || "Partida reciente"}</span></div>
            <div class="match-kda"><strong>${match.kills} / ${match.deaths} / ${match.assists}</strong><span>KDA</span></div>
            <span class="match-result">${match.win ? "Victoria" : "Derrota"}</span>
          </article>
        `).join("")
      : '<div class="empty-history">Aún no hay partidas recientes para mostrar.</div>';

    const rankLabel = player.ranked
      ? `${TIER_LABELS[player.ranked.tier] || player.ranked.tier}${APEX.has(player.ranked.tier) ? "" : ` ${player.ranked.rank}`} · ${player.ranked.leaguePoints} LP`
      : "Sin clasificación";
    const goalLabel = player.goalTier ? (TIER_LABELS[player.goalTier] || player.goalTier) : "Meta pendiente";
    const hasRecentActivity = stats.matchesPlayed > 0;
    const activityMarkup = hasRecentActivity
      ? `
        <section class="modal-section">
          <div class="modal-section-title"><span>Rendimiento reciente</span><small>Últimas ${stats.matchesPlayed} partidas</small></div>
          <div class="modal-grid">
            <div class="modal-stat"><div class="label">Partidas</div><div class="value">${stats.matchesPlayed}</div></div>
            <div class="modal-stat"><div class="label">Victorias</div><div class="value">${stats.wins}</div></div>
            <div class="modal-stat"><div class="label">Pentakills</div><div class="value">${stats.pentakills}</div></div>
            <div class="modal-stat"><div class="label">Mejor racha</div><div class="value">${stats.longestWinStreak || 0}V</div></div>
          </div>
        </section>
        <section class="modal-section">
          <div class="modal-section-title"><span>Historial reciente</span><small>Campeón · KDA · resultado</small></div>
          <div class="match-history">${matchMarkup}</div>
        </section>
        <section class="modal-section">
          <div class="modal-section-title"><span>Campeones más jugados</span><small>Resumen por campeón</small></div>
          <div class="champion-list">${championMarkup}</div>
        </section>`
      : `<section class="modal-empty-state">
          <span class="modal-empty-icon">⌁</span>
          <div><strong>Actividad reciente en preparación</strong><p>Los resultados de partidas aparecerán aquí cuando Riot complete la actualización. Tu rango y meta siguen disponibles arriba.</p></div>
        </section>`;

    modalBody.innerHTML = `
      <section class="modal-player-hero">
        <img class="modal-profile-icon" src="${player.profileIconUrl}" alt="" />
        <div class="modal-rank-summary">
          <span class="section-kicker">Perfil competitivo</span>
          <strong>${rankLabel}</strong>
          <span>#${player.tagLine} · ${player.summonerLevel} nivel</span>
        </div>
        <div class="modal-goal">
          <span>Meta</span>
          ${player.goalTier ? `<img src="${getTierIconPath(player.goalTier)}" alt="Meta: ${goalLabel}" />` : ""}
          <strong>${goalLabel}</strong>
        </div>
      </section>
      ${activityMarkup}
    `;
    modal.hidden = false;
  }

  function closePlayerModal() {
    modal.hidden = true;
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  }

  function startCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      if (!nextUpdateAt) return;
      const remaining = nextUpdateAt - Date.now();
      if (remaining <= 0) {
        countdownEl.textContent = "actualizando…";
        return;
      }
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      countdownEl.textContent = `${m}m ${s.toString().padStart(2, "0")}s`;
    }, 1000);
  }

  async function load(forceRefresh = false) {
    refreshBtn.disabled = true;
    statusDot.className = "status-dot";
    statusText.textContent = forceRefresh ? "Actualizando…" : "Cargando datos…";
    errorBox.hidden = true;

    try {
      const url = forceRefresh ? `${CFG.BACKEND_URL}?refresh=1` : CFG.BACKEND_URL;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`El backend respondió ${res.status}`);
      const data = await res.json();

      render(data.players);
      updatedAtEl.textContent = formatTime(data.updatedAt);
      nextUpdateAt = data.nextUpdateAt || Date.now() + CFG.REFRESH_MS;
      startCountdown();

      statusDot.className = "status-dot live";
      statusText.textContent = data.stale
        ? "Mostrando último dato disponible"
        : "En vivo";

      if (data.warning) {
        errorBox.hidden = false;
        errorBox.textContent = data.warning;
      }
    } catch (err) {
      statusDot.className = "status-dot error";
      statusText.textContent = "No se pudo cargar";
      errorBox.hidden = false;
      errorBox.textContent =
        "No se pudo conectar con el backend. Revisa que la URL en config.js sea correcta y que el backend esté desplegado en Vercel. Detalle: " +
        err.message;
    } finally {
      refreshBtn.disabled = false;
    }
  }

  refreshBtn.addEventListener("click", () => load(true));
  viewTabs.forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
  modalClose.addEventListener("click", closePlayerModal);
  modal.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-modal]")) closePlayerModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closePlayerModal();
  });

  load();
  setInterval(() => load(), CFG.REFRESH_MS);
})();
