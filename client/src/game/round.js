export class RoundManager {
    constructor(opts = {}) {
        this.roundsToWin = opts.roundsToWin || 5;
        this.roundDuration = opts.roundDuration || 60;
        this.betweenRounds = opts.betweenRounds || 3; // сек

        this.scoreT = 0;
        this.scoreCT = 0;
        this.roundNumber = 1;
        this.roundTimer = this.roundDuration;
        this.state = 'warmup'; // warmup | playing | roundEnd | matchEnd
        this.betweenTimer = 0;
        this.lastWinner = null;

        this.onRoundStart = opts.onRoundStart || (() => {});
        this.onRoundEnd = opts.onRoundEnd || (() => {});
        this.onMatchEnd = opts.onMatchEnd || (() => {});
    }

    start() {
        this.state = 'playing';
        this.roundTimer = this.roundDuration;
        this.onRoundStart(this.roundNumber);
        console.log('[round] start round', this.roundNumber);
    }

    update(dt, aliveT, aliveCT) {
        if (this.state === 'playing') {
            this.roundTimer -= dt;
            if (this.roundTimer <= 0) {
                this.roundTimer = 0;
                // Время вышло — CT выигрывают (по CS-логике)
                this.endRound('CT', 'time');
                return;
            }

            // Проверка: живы ли обе команды
            if (aliveT === 0 && aliveCT > 0) {
                this.endRound('CT', 'elim');
            } else if (aliveCT === 0 && aliveT > 0) {
                this.endRound('T', 'elim');
            } else if (aliveT === 0 && aliveCT === 0) {
                this.endRound('CT', 'draw');
            }
        } else if (this.state === 'roundEnd') {
            this.betweenTimer -= dt;
            if (this.betweenTimer <= 0) {
                // Матч закончен?
                if (this.scoreT >= this.roundsToWin || this.scoreCT >= this.roundsToWin) {
                    this.state = 'matchEnd';
                    const winner = this.scoreT >= this.roundsToWin ? 'T' : 'CT';
                    this.onMatchEnd(winner, this.scoreT, this.scoreCT);
                    console.log('[round] match end. Winner:', winner);
                    return;
                }
                this.roundNumber++;
                this.start();
            }
        }
    }

    endRound(winner, reason) {
        if (this.state !== 'playing') return;
        this.state = 'roundEnd';
        this.betweenTimer = this.betweenRounds;
        this.lastWinner = winner;

        if (winner === 'T') this.scoreT++;
        else if (winner === 'CT') this.scoreCT++;

        this.onRoundEnd(winner, reason, this.scoreT, this.scoreCT);
        console.log('[round] end round. Winner:', winner, '| Score T:', this.scoreT, 'CT:', this.scoreCT);
    }

    // Возвращает true, если матч закончен
    isMatchEnd() {
        return this.state === 'matchEnd';
    }

    // Возвращает true, если сейчас идёт раунд
    isPlaying() {
        return this.state === 'playing';
    }
}
