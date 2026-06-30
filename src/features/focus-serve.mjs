import { checkbox, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { readConfig, writeConfig } from '../utils/config.mjs';
import { runInWorkspace, WORKSPACE_ROOT } from '../utils/runner.mjs';
import { resolve } from 'path';
import { writeFileSync, readFileSync } from 'fs';

const ROUTING_SRC  = 'src/app/app-routing.config.ts';
const ROUTING_DEST = 'src/app/app-routing.focus.config.ts';

const LAZY_ROUTE_RE = /loadChildren:\s*\(\)\s*=>\s*import\(\s*['"][^'"]*\/modules\/([^\/'"]+)[^'"]*['"]\s*\)[\s\S]*?\.then\(\s*\w+\s*=>\s*\w+\.\w+\s*\)/g;

function generateFocusRoutes( selectedModules ) {
    const focus = new Set( selectedModules );
    const src   = readFileSync( resolve( WORKSPACE_ROOT, ROUTING_SRC ), 'utf8' );
    const out   = src.replace( LAZY_ROUTE_RE, ( match, moduleName ) =>
        focus.has( moduleName ) ? match : `loadChildren: () => Promise.resolve([])`
    );
    writeFileSync( resolve( WORKSPACE_ROOT, ROUTING_DEST ), out, 'utf8' );
}

/** @type {import('../index.mjs').Feature} */
export default {
    name: 'Focus Serve',
    description: 'Start ng serve with only selected modules compiled',

    async run() {
        const config  = readConfig();
        const modules = config.focusServe.modules;

        console.log( chalk.cyan( '\n  Select modules to include in the build.\n' ) );
        console.log( chalk.dim( '  Space to toggle  ·  a to toggle all  ·  Enter to confirm\n' ) );

        const chosen = await checkbox( {
            message: 'Modules to compile',
            choices: modules.map( m => ( {
                name:    m.name,
                value:   m.name,
                checked: m.selected,
            } ) ),
            pageSize: 20,
            loop: false,
            validate( answers ) {
                if ( answers.length === 0 ) return 'Select at least one module.';

                return true;
            },
        } );

        // Persist selection back to config
        for ( const m of modules ) {
            m.selected = chosen.includes( m.name );
        }
        writeConfig( config );

        console.log( chalk.green( `\n  ✔ Saved. Selected: ${chalk.bold( chosen.join( ', ' ) )}\n` ) );

        const action = await select( {
            message: 'What would you like to do?',
            choices: [
                { name: 'Start ng serve (focus mode)',   value: 'serve' },
                { name: 'Save selection only',           value: 'save'  },
                { name: chalk.dim( '← Back to main menu' ), value: 'back', short: 'Back' },
            ],
            loop: false,
        } );

        if ( action === 'back' || action === 'save' ) return;

        console.log( chalk.dim( '\n  Generating focused routing file…' ) );
        generateFocusRoutes( chosen );
        console.log( chalk.dim( `  Running: ng serve --configuration focus\n` ) );

        await runInWorkspace( 'npx', [ 'ng', 'serve', '--configuration', 'focus' ] );
    },
};
