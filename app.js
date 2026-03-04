(function () {
  'use strict';

  // Team sizes per official rules (avalon.fun/pdfs/rules.pdf) – Team Building Phase chart.
  // Rows = 1st–5th Quest, cols = 5–10 players. Leader assigns this many Team Tokens.
  const QUEST_TEAM_SIZES = {
    5: [2, 3, 2, 3, 3],
    6: [2, 3, 4, 3, 4],
    7: [2, 3, 3, 4, 4],
    8: [3, 4, 4, 5, 5],
    9: [3, 4, 4, 5, 5],
    10: [3, 4, 4, 5, 5],
  };

  const STORAGE_KEY = 'avalon-assistant-state';

  let state = {
    players: [],
    playerCount: 5,
    currentMission: 1,       // 1–5
    successCount: 0,
    failCount: 0,
    leaderIndex: 0,
    rejectionCountThisRound: 0,
    proposedTeam: null,      // array of player names when voting
    currentProposer: null,   // who proposed the current team (set when they click Propose)
    history: [],             // { mission, teamSize, proposedTeam, approvedBy, rejectedBy, result: 'success'|'fail'|null }
    voteRounds: [],          // rejected proposals this round: { proposedTeam, approvedBy, rejectedBy }
  };

  const $ = (id) => document.getElementById(id);

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = { ...state, ...parsed };
        return true;
      }
    } catch (_) {}
    return false;
  }

  function getRequiredTeamSize() {
    const sizes = QUEST_TEAM_SIZES[state.playerCount];
    return sizes ? sizes[state.currentMission - 1] : 2;
  }

  function renderMissionSizeHint() {
    const n = parseInt($('player-count').value, 10);
    const sizes = QUEST_TEAM_SIZES[n];
    if (!sizes) return;
    const ordinals = ['1st', '2nd', '3rd', '4th', '5th'];
    $('mission-size-hint').textContent =
      'Team size per Quest: ' + sizes.map((s, i) => ordinals[i] + '=' + s).join(', ') + '.';
  }

  function startGame() {
    const count = parseInt($('player-count').value, 10);
    const namesInput = $('player-names').value.trim();
    const names = namesInput
      ? namesInput.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
      : [];

    if (names.length !== count) {
      alert('Please enter exactly ' + count + ' player names (comma-separated).');
      return;
    }

    state = {
      players: names,
      playerCount: count,
      currentMission: 1,
      successCount: 0,
      failCount: 0,
      leaderIndex: 0,
      rejectionCountThisRound: 0,
      proposedTeam: null,
      currentProposer: null,
      history: [],
      voteRounds: [],
    };
    saveState();
    showGameSection();
    renderGame();
  }

  function resetGame() {
    state = {
      players: [],
      playerCount: 5,
      currentMission: 1,
      successCount: 0,
      failCount: 0,
      leaderIndex: 0,
      rejectionCountThisRound: 0,
      proposedTeam: null,
      currentProposer: null,
      history: [],
      voteRounds: [],
    };
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    $('player-count').value = '5';
    $('player-names').value = '';
    $('setup-section').hidden = false;
    $('game-section').hidden = true;
    renderMissionSizeHint();
  }

  function showGameSection() {
    $('setup-section').hidden = true;
    $('game-section').hidden = false;
  }

  function getLeaderName() {
    return state.players[state.leaderIndex] || '—';
  }

  function renderGame() {
    const teamSize = getRequiredTeamSize();

    $('current-mission-num').textContent = state.currentMission;
    $('required-team-size').textContent = teamSize;
    $('success-count').textContent = state.successCount;
    $('fail-count').textContent = state.failCount;
    $('rejection-count').textContent = state.rejectionCountThisRound;
    $('current-leader').textContent = getLeaderName();
    $('current-proposer').textContent = getLeaderName();
    $('team-size-reminder').textContent = teamSize;

    renderTeamCheckboxes(teamSize);
    renderVotePanel();
    renderMissionResultPanel();
    renderVoteRounds();
    renderHistory();
    renderVoteRoundsNote();
  }

  function renderTeamCheckboxes(requiredSize) {
    const container = $('team-checkboxes');
    container.innerHTML = '';
    state.players.forEach((name) => {
      const id = 'team-' + name.replace(/\s/g, '-');
      const label = document.createElement('label');
      label.innerHTML =
        '<input type="checkbox" name="team-member" value="' + escapeHtml(name) + '" /> ' + escapeHtml(name);
      label.querySelector('input').id = id;
      container.appendChild(label);
    });
  }

  function getSelectedTeam() {
    const checkboxes = document.querySelectorAll('input[name="team-member"]:checked');
    return Array.from(checkboxes).map((el) => el.value);
  }

  function proposeTeam() {
    const required = getRequiredTeamSize();
    const selected = getSelectedTeam();
    if (selected.length !== required) {
      alert('Please assign exactly ' + required + ' Team Tokens for this Quest (see team size above).');
      return;
    }
    state.proposedTeam = selected;
    state.currentProposer = getLeaderName();
    saveState();
    renderGame();
    $('vote-panel').classList.remove('hidden');
    $('mission-result-panel').classList.add('hidden');
  }

  function cancelProposal() {
    state.proposedTeam = null;
    state.currentProposer = null;
    saveState();
    renderGame();
    $('vote-panel').classList.add('hidden');
  }

  function renderVotePanel() {
    const panel = $('vote-panel');
    const summary = $('proposed-team-summary');
    const inputs = $('vote-inputs');
    if (!state.proposedTeam || state.proposedTeam.length === 0) {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    $('proposed-by-summary').textContent = 'Leader (proposed this Team): ' + (state.currentProposer || getLeaderName());
    summary.textContent = 'Team: ' + state.proposedTeam.join(', ');
    inputs.innerHTML = '';
    state.players.forEach((name) => {
      const id = 'vote-' + name.replace(/\s/g, '-');
      const label = document.createElement('label');
      label.innerHTML =
        escapeHtml(name) +
        ' <select data-voter="' + escapeHtml(name) + '"><option value="">—</option><option value="yes">Approve</option><option value="no">Reject</option></select>';
      inputs.appendChild(label);
    });
  }

  function getVotes() {
    const selects = document.querySelectorAll('select[data-voter]');
    const votes = {};
    selects.forEach((sel) => {
      const voter = sel.getAttribute('data-voter');
      votes[voter] = sel.value;
    });
    return votes;
  }

  function submitVotes() {
    const votes = getVotes();
    const approvedBy = [];
    const rejectedBy = [];
    state.players.forEach((name) => {
      const v = votes[name];
      if (v === 'yes') approvedBy.push(name);
      else if (v === 'no') rejectedBy.push(name);
    });

    const missing = state.players.filter((n) => !votes[n] || votes[n] === '');
    if (missing.length > 0) {
      alert('Please set a vote (Approve or Reject) for every player: ' + missing.join(', '));
      return;
    }

    // Rules: "The Team is approved if the majority accepts. If the Team is rejected (a tied Vote is also rejection)"
    const totalApproved = approvedBy.length;
    const approved = totalApproved > state.players.length / 2;

    const proposer = state.currentProposer || getLeaderName();
    if (approved) {
      state.voteRounds.push({
        proposedBy: proposer,
        proposedTeam: state.proposedTeam.slice(),
        approvedBy: approvedBy.slice(),
        rejectedBy: rejectedBy.slice(),
        result: 'approved',
      });
      state.proposedTeam = null;
      state.currentProposer = null;
      saveState();
      $('vote-panel').classList.add('hidden');
      showMissionResultPanel();
      renderGame();
      $('mission-result-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    state.rejectionCountThisRound++;
    state.voteRounds.push({
      proposedBy: proposer,
      proposedTeam: state.proposedTeam.slice(),
      approvedBy: approvedBy.slice(),
      rejectedBy: rejectedBy.slice(),
      result: 'rejected',
    });
    state.history.push({
      mission: state.currentMission,
      teamSize: getRequiredTeamSize(),
      proposedBy: proposer,
      proposedTeam: state.proposedTeam.slice(),
      approvedBy: approvedBy.slice(),
      rejectedBy: rejectedBy.slice(),
      result: 'rejected',
    });
    state.leaderIndex = (state.leaderIndex + 1) % state.players.length;
    state.proposedTeam = null;
    saveState();

    if (state.rejectionCountThisRound >= 5) {
      alert('Evil wins: five Teams are rejected in a single round (5 consecutive failed Votes).');
      renderGame();
      return;
    }

    renderGame();
    $('vote-panel').classList.add('hidden');
  }

  function getMissionTeam() {
    const lastRound = state.voteRounds[state.voteRounds.length - 1];
    return lastRound && lastRound.result === 'approved' ? lastRound.proposedTeam : [];
  }

  function showMissionResultPanel() {
    const panel = $('mission-result-panel');
    const lastRound = state.voteRounds[state.voteRounds.length - 1];
    const team = getMissionTeam();
    $('mission-proposed-by').textContent = (lastRound && lastRound.proposedBy) ? lastRound.proposedBy : (state.currentProposer || getLeaderName()) || '—';
    $('mission-team-display').textContent = team.join(', ');
    const mission4Rule = $('mission-4-rule');
    mission4Rule.hidden = !(state.currentMission === 4 && state.playerCount >= 7);
    renderMissionCardsInputs(team);
    panel.classList.remove('hidden');
  }

  function renderMissionCardsInputs(team) {
    const container = $('mission-cards-inputs');
    container.innerHTML = '';
    (team || []).forEach((name) => {
      const label = document.createElement('label');
      label.className = 'mission-card-row';
      label.innerHTML =
        '<span class="mission-card-name">' + escapeHtml(name) + '</span> ' +
        '<select data-mission-card="' + escapeHtml(name) + '">' +
        '<option value="">—</option>' +
        '<option value="success">Success</option>' +
        '<option value="fail">Fail</option>' +
        '</select>';
      container.appendChild(label);
    });
  }

  function getMissionCardsPlayed() {
    const team = getMissionTeam();
    const selects = document.querySelectorAll('select[data-mission-card]');
    const played = {};
    selects.forEach((sel) => {
      const name = sel.getAttribute('data-mission-card');
      played[name] = sel.value;
    });
    return { team, played };
  }

  // Rules: "The Quest is completed successfully only if all the cards revealed are Success cards.
  // The Quest fails if one (or more) Fail cards have been played."
  // "The 4th Quest (and only the 4th Quest) in games of 7 or more players requires at least two Quest Fail cards to be a failed Quest."
  function computeMissionResult(team, played) {
    let failCount = 0;
    team.forEach((name) => {
      if (played[name] === 'fail') failCount++;
    });
    if (state.currentMission === 4 && state.playerCount >= 7) {
      return failCount >= 2 ? 'fail' : 'success';
    }
    return failCount >= 1 ? 'fail' : 'success';
  }

  function revealOutcome() {
    const { team, played } = getMissionCardsPlayed();
    const missing = team.filter((name) => !played[name] || played[name] === '');
    if (missing.length > 0) {
      alert('Please select Success or Fail for each team member: ' + missing.join(', '));
      return;
    }
    const result = computeMissionResult(team, played);
    recordMissionResult(result);
  }

  function recordMissionResult(result) {
    const lastRound = state.voteRounds[state.voteRounds.length - 1];
    const team = lastRound ? lastRound.proposedTeam : [];
    const approvedBy = lastRound ? lastRound.approvedBy : [];
    const rejectedBy = lastRound ? lastRound.rejectedBy : [];
    const proposedBy = lastRound && lastRound.proposedBy ? lastRound.proposedBy : getLeaderName();

    state.history.push({
      mission: state.currentMission,
      teamSize: getRequiredTeamSize(),
      proposedBy,
      proposedTeam: team.slice(),
      approvedBy: approvedBy.slice(),
      rejectedBy: rejectedBy.slice(),
      result,
    });

    if (result === 'success') state.successCount++;
    else state.failCount++;

    state.rejectionCountThisRound = 0;
    state.voteRounds = [];

    if (state.successCount >= 3) {
      alert('Arthur and Goodness prevail: the team of Good has successfully completed three Quests!');
    } else if (state.failCount >= 3) {
      alert('Mordred\'s dark forces triumph: three Quests have ended in failure.');
    } else {
      state.currentMission++;
      state.leaderIndex = (state.leaderIndex + 1) % state.players.length;
      if (state.currentMission > 5) {
        alert('All five Quests completed. Check success/fail count for winner.');
      }
    }

    state.proposedTeam = null;
    state.currentProposer = null;
    saveState();
    $('mission-result-panel').classList.add('hidden');
    renderGame();
  }

  function renderMissionResultPanel() {
    if (!state.proposedTeam && state.voteRounds.length > 0) {
      const last = state.voteRounds[state.voteRounds.length - 1];
      if (last && last.result === 'approved') {
        const team = last.proposedTeam || [];
        $('mission-proposed-by').textContent = last.proposedBy || state.currentProposer || '—';
        $('mission-team-display').textContent = team.join(', ');
        $('mission-4-rule').hidden = !(state.currentMission === 4 && state.playerCount >= 7);
        renderMissionCardsInputs(team);
        $('mission-result-panel').classList.remove('hidden');
        return;
      }
    }
    $('mission-result-panel').classList.add('hidden');
  }

  function renderHistory() {
    const tbody = $('history-body');
    tbody.innerHTML = '';
    state.history.forEach((row) => {
      const tr = document.createElement('tr');
      const resultClass =
        row.result === 'success' ? 'result-success' :
        row.result === 'fail' ? 'result-fail' : 'result-rejected';
      const resultText =
        row.result === 'success' ? 'Success' :
        row.result === 'fail' ? 'Failed' : 'Rejected';
      tr.innerHTML =
        '<td>' + row.mission + '</td>' +
        '<td>' + row.teamSize + '</td>' +
        '<td>' + escapeHtml(row.proposedBy || '—') + '</td>' +
        '<td>' + escapeHtml(row.proposedTeam.join(', ')) + '</td>' +
        '<td>' + escapeHtml(row.approvedBy.join(', ') || '—') + '</td>' +
        '<td>' + escapeHtml(row.rejectedBy.join(', ') || '—') + '</td>' +
        '<td class="' + resultClass + '">' + resultText + '</td>';
      tbody.appendChild(tr);
    });
    renderPlayerAnalysisTable();
    renderRelationshipMap();
  }

  function renderRelationshipMap() {
    const container = $('relationship-map');
    container.innerHTML = '';
    const players = state.players || [];
    const history = state.history || [];
    if (players.length === 0 || history.length === 0) return;

    players.forEach((player) => {
      const card = document.createElement('div');
      card.className = 'relationship-card';
      const nameEsc = escapeHtml(player);

      // When this player led: who voted for/against their teams
      const whenLed = history.filter((r) => r.proposedBy === player);
      let whenLedHtml = '';
      if (whenLed.length > 0) {
        whenLedHtml = '<div class="relationship-section"><strong>When ' + nameEsc + ' led</strong><ul class="relationship-list">';
        whenLed.forEach((r) => {
          const qLabel = r.result === 'rejected' ? 'Quest ' + r.mission + ' (rej)' : 'Quest ' + r.mission;
          const approve = (r.approvedBy && r.approvedBy.length) ? 'Approve: ' + escapeHtml(r.approvedBy.join(', ')) : '';
          const reject = (r.rejectedBy && r.rejectedBy.length) ? 'Reject: ' + escapeHtml(r.rejectedBy.join(', ')) : '';
          whenLedHtml += '<li>' + qLabel + ' — ' + [approve, reject].filter(Boolean).join('; ') + '</li>';
        });
        whenLedHtml += '</ul></div>';
      }

      // This player voted: whom they approved / rejected (by leader name and quest)
      const approvedWhom = [];
      const rejectedWhom = [];
      history.forEach((r) => {
        if (r.proposedBy === player) return;
        const leader = r.proposedBy || '—';
        const qLabel = r.result === 'rejected' ? 'Q' + r.mission + '(rej)' : 'Q' + r.mission;
        if (r.approvedBy && r.approvedBy.indexOf(player) !== -1) approvedWhom.push(leader + ' (' + qLabel + ')');
        if (r.rejectedBy && r.rejectedBy.indexOf(player) !== -1) rejectedWhom.push(leader + ' (' + qLabel + ')');
      });
      let votedHtml = '<div class="relationship-section"><strong>' + nameEsc + ' voted</strong><ul class="relationship-list">';
      if (approvedWhom.length) votedHtml += '<li class="approved">Approved: ' + escapeHtml(approvedWhom.join(', ')) + '</li>';
      if (rejectedWhom.length) votedHtml += '<li class="rejected">Rejected: ' + escapeHtml(rejectedWhom.join(', ')) + '</li>';
      if (!approvedWhom.length && !rejectedWhom.length) votedHtml += '<li>—</li>';
      votedHtml += '</ul></div>';

      // Missions that included this player (success/failed only)
      const missionsWithPlayer = history.filter(
        (r) => (r.result === 'success' || r.result === 'fail') && r.proposedTeam && r.proposedTeam.indexOf(player) !== -1
      );
      let missionsHtml = '';
      if (missionsWithPlayer.length > 0) {
        const parts = missionsWithPlayer.map((r) => {
          const cls = r.result === 'success' ? 'result-success' : 'result-fail';
          return '<span class="' + cls + '">Q' + r.mission + ' ' + (r.result === 'success' ? 'Success' : 'Failed') + '</span>';
        });
        missionsHtml = '<div class="relationship-section"><strong>Missions with ' + nameEsc + '</strong><p class="relationship-missions">' + parts.join(', ') + '</p></div>';
      } else {
        missionsHtml = '<div class="relationship-section"><strong>Missions with ' + nameEsc + '</strong><p class="relationship-missions note">—</p></div>';
      }

      card.innerHTML = '<h5 class="relationship-player-name">' + nameEsc + '</h5>' + whenLedHtml + votedHtml + missionsHtml;
      container.appendChild(card);
    });
  }

  /** Returns cell label for By Player table: ✓ or ✗, with "(T)" if player was on the team. */
  function getPlayerCellLabel(row, playerName) {
    const approved = row.approvedBy && row.approvedBy.indexOf(playerName) !== -1;
    const rejected = row.rejectedBy && row.rejectedBy.indexOf(playerName) !== -1;
    const onTeam = row.proposedTeam && row.proposedTeam.indexOf(playerName) !== -1;
    const vote = approved ? '✓' : rejected ? '✗' : '';
    if (!vote) return '—';
    return onTeam ? vote + '(T)' : vote;
  }

  function renderPlayerAnalysisTable() {
    const table = $('player-analysis-table');
    const thead = $('player-analysis-head');
    const tbody = $('player-analysis-body');
    const players = state.players || [];
    thead.innerHTML = '';
    tbody.innerHTML = '';
    if (players.length === 0) return;
    let colgroup = table.querySelector('colgroup');
    if (!colgroup) {
      colgroup = document.createElement('colgroup');
      table.insertBefore(colgroup, table.querySelector('thead'));
    }
    colgroup.innerHTML =
      '<col class="col-quest">' +
      '<col class="col-result">' +
      '<col class="col-leader">' +
      players.map(() => '<col class="col-player">').join('');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = '<th>Quest</th><th>Result</th><th>Leader</th>';
    players.forEach((name) => {
      const th = document.createElement('th');
      th.className = 'player-col';
      th.textContent = name;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.style.minWidth = (4.5 + 5.5 + 4.5 + 4.5 * players.length) + 'rem';
    const history = state.history;
    for (let i = 0; i < history.length; i++) {
      const row = history[i];
      const isFirstInQuestBlock = i === 0 || history[i - 1].mission !== row.mission;
      let questRowspan = 1;
      if (isFirstInQuestBlock) {
        while (i + questRowspan < history.length && history[i + questRowspan].mission === row.mission) {
          questRowspan++;
        }
      }
      const resultClass =
        row.result === 'success' ? 'result-success' :
        row.result === 'fail' ? 'result-fail' : 'result-rejected';
      const resultText =
        row.result === 'success' ? 'Success' :
        row.result === 'fail' ? 'Failed' : 'Rejected';
      const tr = document.createElement('tr');
      if (isFirstInQuestBlock) {
        const questTd = document.createElement('td');
        questTd.textContent = String(row.mission);
        questTd.rowSpan = questRowspan;
        tr.appendChild(questTd);
      }
      const resultTd = document.createElement('td');
      resultTd.className = 'result-cell ' + resultClass;
      resultTd.textContent = resultText;
      tr.appendChild(resultTd);
      const leaderTd = document.createElement('td');
      leaderTd.className = 'leader-cell';
      leaderTd.textContent = row.proposedBy || '—';
      tr.appendChild(leaderTd);
      players.forEach((name) => {
        const td = document.createElement('td');
        td.className = 'player-cell';
        td.textContent = getPlayerCellLabel(row, name);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
  }

  function renderVoteRounds() {
    const list = $('vote-rounds-list');
    list.innerHTML = '';
    state.voteRounds.forEach((round, i) => {
      const div = document.createElement('div');
      div.className = 'vote-round-item';
      const outcomeText =
        round.result === 'approved'
          ? '— Approved (select Quest success or failed below)'
          : '— Rejected';
      const proposedBy = round.proposedBy || '—';
      div.innerHTML =
        '<div class="team">Proposal ' + (i + 1) + ': ' + escapeHtml(round.proposedTeam.join(', ')) + '</div>' +
        '<div class="proposed-by">Leader: ' + escapeHtml(proposedBy) + '</div>' +
        '<span class="approved">Approve: ' + escapeHtml(round.approvedBy.join(', ') || '—') + '</span><br />' +
        '<span class="rejected">Reject: ' + escapeHtml(round.rejectedBy.join(', ') || '—') + '</span>' +
        '<div class="outcome">' + outcomeText + '</div>';
      list.appendChild(div);
    });
    $('vote-rounds-card').hidden = state.voteRounds.length === 0;
    const outcomeBlock = $('vote-rounds-outcome-block');
    const lastApproved = state.voteRounds.length > 0 && state.voteRounds[state.voteRounds.length - 1].result === 'approved';
    outcomeBlock.hidden = !lastApproved;
  }

  function renderVoteRoundsNote() {
    const note = $('vote-rounds-note');
    const rejected = state.voteRounds.filter((r) => r.result === 'rejected');
    if (rejected.length === 0) {
      note.textContent = '';
      return;
    }
    note.textContent =
      'This round: ' +
      rejected.length +
      ' Team proposal(s) rejected. When a Team is approved and the Quest is completed, it appears in the table above.';
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function bind() {
    $('player-count').addEventListener('change', renderMissionSizeHint);
    $('btn-start-game').addEventListener('click', startGame);
    $('btn-reset').addEventListener('click', resetGame);
    $('btn-reset-game').addEventListener('click', resetGame);
    $('btn-propose').addEventListener('click', proposeTeam);
    $('btn-cancel-proposal').addEventListener('click', cancelProposal);
    $('btn-approve-vote').addEventListener('click', submitVotes);
    $('btn-reveal-outcome').addEventListener('click', revealOutcome);
    $('btn-mission-success').addEventListener('click', () => recordMissionResult('success'));
    $('btn-mission-fail').addEventListener('click', () => recordMissionResult('fail'));
    $('btn-mission-success-inline').addEventListener('click', () => recordMissionResult('success'));
    $('btn-mission-fail-inline').addEventListener('click', () => recordMissionResult('fail'));
  }

  function init() {
    bind();
    renderMissionSizeHint();
    if (loadState() && state.players && state.players.length > 0) {
      showGameSection();
      renderGame();
    }
  }

  init();
})();
