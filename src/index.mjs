#!/usr/bin/env node
/**
 * Europort Dev Toolkit
 *
 * Entry point. Registers features and shows the main interactive menu.
 *
 * To add a new feature:
 *   1. Create src/features/my-feature.mjs exporting a default object:
 *        { name: string, description: string, run(): Promise<void> }
 *   2. Import it below and add it to the FEATURES array.
 */

import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { isSetupDone } from './features/setup.mjs';

// ─── Feature registry ────────────────────────────────────────────────────────
import setup     from './features/setup.mjs';
import focusServe from './features/focus-serve.mjs';

/** @typedef {{ name: string, description: string, run(): Promise<void> }} Feature */

/** @type {Feature[]} */
const FEATURES = [
    setup,
    focusServe,
    // add new features here ↓
];
// ─────────────────────────────────────────────────────────────────────────────

function printBanner() {
    console.log( '' );
    console.log( chalk.bold.cyan( '  ╔══════════════════════════════════╗' ) );
    console.log( chalk.bold.cyan( '  ║   🛠  Europort Dev Toolkit       ║' ) );
    console.log( chalk.bold.cyan( '  ╚══════════════════════════════════╝' ) );
    console.log( '' );
}

async function mainMenu() {
    printBanner();

    // First-run guard: prompt setup if workspace not yet patched
    if ( !isSetupDone() ) {
        console.log( chalk.yellow( '  ⚠  Workspace setup not applied yet.\n' ) );
        await setup.run();
        console.log( '' );
    }

    while ( true ) {
        const choices = [
            ...FEATURES.map( ( f, i ) => ( {
                name:  `${chalk.bold( f.name )}  ${chalk.dim( f.description )}`,
                value: i,
                short: f.name,
            } ) ),
            new ( await import( '@inquirer/prompts' ) ).Separator(),
            { name: chalk.dim( 'Exit' ), value: -1, short: 'Exit' },
        ];

        const picked = await select( {
            message: 'Choose a tool',
            choices,
            pageSize: FEATURES.length + 3,
            loop: false,
        } );

        if ( picked === -1 ) {
            console.log( chalk.dim( '\n  Goodbye 👋\n' ) );
            process.exit( 0 );
        }

        try {
            await FEATURES[ picked ].run();
        } catch ( err ) {
            // ExitPromptError = user hit Ctrl+C inside a prompt
            if ( err?.name === 'ExitPromptError' ) {
                console.log( chalk.dim( '\n  ↩  Back to main menu\n' ) );
                continue;
            }

            console.error( chalk.red( `\n  Error: ${err.message}\n` ) );
        }

        console.log( '' );
    }
}

mainMenu().catch( err => {
    if ( err?.name === 'ExitPromptError' ) process.exit( 0 );
    console.error( chalk.red( err.message ) );
    process.exit( 1 );
} );
