import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import { confirm } from '@inquirer/prompts';
import { WORKSPACE_ROOT } from '../utils/runner.mjs';

const ANGULAR_JSON_PATH = resolve( WORKSPACE_ROOT, 'angular.json' );
const GITIGNORE_PATH    = resolve( WORKSPACE_ROOT, '.gitignore' );

const GITIGNORE_BLOCK = `
# Dev Toolkit — generated files (do not edit manually)
src/app/app-routing.focus.config.ts
dev-toolkit/node_modules/
`;

const FOCUS_BUILD_CONFIG = {
    sourceMap: true,
    optimization: false,
    assets: [
        'src/favicon.svg',
        {
            glob: '**/*',
            input: 'src/assets/',
            ignore: [ '**/*.scss' ],
            output: '/assets/',
        },
        'src/authentication.configuration.json',
    ],
    fileReplacements: [
        {
            replace: 'src/app/app-routing.config.ts',
            with:    'src/app/app-routing.focus.config.ts',
        },
    ],
};

const MODULES = [
    'account-management', 'advisor', 'authorisation', 'backoffice',
    'configuration', 'corporate-actions', 'fee-charge', 'generic-interface',
    'helper', 'home', 'infront', 'instrument', 'legal-reporting', 'margin',
    'midoffice', 'order', 'payments', 'pension', 'performance-reportings',
    'private-banking', 'recon', 'settings', 'settlement', 'transaction', 'wealth',
];

const FOCUS_SERVE_CONFIG = {
    buildTarget: 'topicus:build:focus',
};

export function isSetupDone() {
    if ( !existsSync( ANGULAR_JSON_PATH ) ) return false;
    const json = JSON.parse( readFileSync( ANGULAR_JSON_PATH, 'utf8' ) );
    const confs = json?.projects?.topicus?.architect?.build?.configurations ?? {};

    return 'focus' in confs;
}

function patchAngularJson() {
    const json = JSON.parse( readFileSync( ANGULAR_JSON_PATH, 'utf8' ) );
    const arch = json.projects.topicus.architect;

    // Focus serve
    arch.build.configurations.focus = FOCUS_BUILD_CONFIG;
    arch.serve.configurations.focus  = FOCUS_SERVE_CONFIG;

    // Per-module test configurations (used by Focus Test)
    if ( !arch.test.configurations ) arch.test.configurations = {};
    for ( const mod of MODULES ) {
        arch.test.configurations[ mod ] = {
            include: [ `src/app/modules/${mod}/**/*.spec.ts` ],
        };
    }

    // test-dev also needs them if the target exists
    if ( arch[ 'test-dev' ] ) {
        if ( !arch[ 'test-dev' ].configurations ) arch[ 'test-dev' ].configurations = {};
        for ( const mod of MODULES ) {
            arch[ 'test-dev' ].configurations[ mod ] = {
                include: [ `src/app/modules/${mod}/**/*.spec.ts` ],
            };
        }
    }

    writeFileSync( ANGULAR_JSON_PATH, JSON.stringify( json, null, 2 ) + '\n', 'utf8' );
}

function patchGitignore() {
    const current = existsSync( GITIGNORE_PATH )
        ? readFileSync( GITIGNORE_PATH, 'utf8' )
        : '';

    if ( current.includes( 'app-routing.focus.config.ts' ) ) return;

    writeFileSync( GITIGNORE_PATH, current + GITIGNORE_BLOCK, 'utf8' );
}

/** @type {import('../index.mjs').Feature} */
export default {
    name: 'Setup',
    description: 'Patch angular.json and .gitignore in the workspace (run once)',

    async run() {
        const done = isSetupDone();

        if ( done ) {
            console.log( chalk.yellow( '\n  ⚠  Setup already applied to this workspace.\n' ) );
            const redo = await confirm( {
                message: 'Re-apply anyway?',
                default: false,
            } );
            if ( !redo ) return;
        }

        console.log( chalk.cyan( '\n  This will modify the following files in the workspace:\n' ) );
        console.log( chalk.dim( `    • angular.json  — add build:focus + serve:focus + per-module test configurations` ) );
        console.log( chalk.dim( `    • .gitignore    — add generated routing file + dev-toolkit/node_modules/\n` ) );

        const ok = await confirm( { message: 'Proceed?', default: true } );
        if ( !ok ) return;

        patchAngularJson();
        console.log( chalk.green( '  ✔ angular.json patched' ) );

        patchGitignore();
        console.log( chalk.green( '  ✔ .gitignore patched' ) );

        console.log( chalk.bold.green( '\n  Setup complete! You can now use Focus Serve.\n' ) );
    },
};
