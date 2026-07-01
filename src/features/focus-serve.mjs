import { checkbox, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { readConfig, writeConfig } from '../utils/config.mjs';
import { runInWorkspace, WORKSPACE_ROOT } from '../utils/runner.mjs';
import { resolve } from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, readFileSync } from 'fs';

const TOOLKIT_DIR  = resolve( dirname( fileURLToPath( import.meta.url ) ), '../../' );
const ROUTING_SRC  = 'src/app/app-routing.config.ts';
const ROUTING_DEST = resolve( TOOLKIT_DIR, 'assets/app-routing.focus.config.ts' );

const LAZY_ROUTE_RE = /loadChildren:\s*\(\)\s*=>\s*import\(\s*['"][^'"]*\/modules\/([^\/'"]+)[^'"]*['"]\s*\)[\s\S]*?\.then\(\s*\w+\s*=>\s*\w+\.\w+\s*\)/g;

function generateFocusRoutes( selectedModules ) {
    const focus = new Set( selectedModules );
    const src   = readFileSync( resolve( WORKSPACE_ROOT, ROUTING_SRC ), 'utf8' );
    // Rewrite relative imports: file moves from src/app/ to dev-toolkit/assets/
    const rebased = src
        .replace( /from\s+'(\.\/[^']+)'/g, `from '../../src/app/$1'` )
        .replace( /from\s+"(\.\/[^"]+)"/g, `from '../../src/app/$1'` )
        .replace( /import\(\s*'(\.\/[^']+)'\s*\)/g, `import('../../src/app/$1')` )
        .replace( /import\(\s*"(\.\/[^"]+)"\s*\)/g, `import('../../src/app/$1')` );
    const out = rebased.replace( LAZY_ROUTE_RE, ( match, moduleName ) =>
        focus.has( moduleName ) ? match : `loadChildren: () => Promise.resolve([])`
    );
    writeFileSync( ROUTING_DEST, out, 'utf8' );
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
