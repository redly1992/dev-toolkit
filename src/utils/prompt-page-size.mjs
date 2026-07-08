/**
 * Keep prompt cursor visible and near upper half on short terminals.
 * Inquirer scrolls when cursor reaches viewport bottom, so using
 * half-screen page size prevents pointer from dropping below screen middle.
 */
export function getAdaptivePageSize( totalChoices, min = 6 ) {
    const rows = Number( process.stdout?.rows ) || 24;
    const halfScreen = Math.floor( rows / 2 );
    const safe = Math.max( min, halfScreen );

    return Math.max( 1, Math.min( totalChoices, safe ) );
}

