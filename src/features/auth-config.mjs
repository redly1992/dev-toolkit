import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { readConfig, writeConfig } from '../utils/config.mjs';
import { WORKSPACE_ROOT } from '../utils/runner.mjs';

const AUTH_CONFIG_PATH = resolve( WORKSPACE_ROOT, 'src/authentication.configuration.json' );

const LDAP_BASE_URL = 'http://localhost:3000';

const BASE_URL_TEMPLATES = [
    'http://prod-{version}-epicnl.gui.stack02.cloud.able.nv:8080',
    'http://nn-{version}-epic.envmgt.stack02.cloud.able.nv:8080',
    'http://ach-{version}-epic.envmgt.stack02.cloud.able.nv:8080',
    'http://ing-{version}-epic.envmgt.stack02.cloud.able.nv:8080',
    'http://aab-{version}-epic.envmgt.stack02.cloud.able.nv:8081',
];

const AUTH_CONFIGS = {
    ldap: {
        authType: 'ldap',
        sessionValidDuration: 60000,
        authConfig: [
            {
                issuer: 'https://adfs.able.nv/adfs',
                clientId: '8787bbd8-540a-463c-863a-53aaa2fdfee2',
                scope: 'openid',
                displayName: 'epic-test-client - Native application',
                strictDocumentValidation: false,
            },
        ],
    },
    jwt: {
        authType: 'jwt',
        sessionValidDuration: 60000,
        authConfig: [
            {
                issuer: 'https://adfs.able.nv/adfs',
                clientId: '45762c25-54d0-4313-ad5f-52c8532bf822',
                scope: 'openid',
                displayName: 'epic-test-client - Native application',
            },
        ],
    },
};

/** @type {import('../index.mjs').Feature} */
export default {
    name: 'Auth Config',
    description: 'Set authentication.configuration.json (ldap / jwt)',

    async run() {
        const config = readConfig();

        if ( !config.authConfig ) config.authConfig = { version: '', authType: 'ldap', baseUrlTemplate: BASE_URL_TEMPLATES[ 0 ] };

        const saved = config.authConfig;
        const hasSavedData = !!( saved.version && saved.baseUrlTemplate );

        // ── Quick Apply (only when saved data exists) ─────────────────────────
        if ( hasSavedData ) {
            const savedBaseUrl = saved.baseUrlTemplate.replace( '{version}', saved.version );
            const otherType    = saved.authType === 'ldap' ? 'jwt' : 'ldap';
            const otherBaseUrl = otherType === 'ldap' ? LDAP_BASE_URL : savedBaseUrl;

            const mode = await select( {
                message: 'Mode',
                choices: [
                    {
                        name:  `Quick Apply — toggle to ${chalk.bold( otherType )}  ${chalk.dim( otherType === 'ldap' ? LDAP_BASE_URL : `v${saved.version} · ${savedBaseUrl}` )}`,
                        value: 'quick-toggle',
                        short: `Quick Apply (${otherType})`,
                    },
                    {
                        name:  `Quick Apply — reapply ${chalk.bold( saved.authType )}  ${chalk.dim( saved.authType === 'ldap' ? LDAP_BASE_URL : `v${saved.version} · ${savedBaseUrl}` )}`,
                        value: 'quick-reapply',
                        short: `Quick Apply (${saved.authType})`,
                    },
                    { name: 'Configure — change settings', value: 'configure', short: 'Configure' },
                ],
                loop: false,
            } );

            if ( mode === 'quick-toggle' || mode === 'quick-reapply' ) {
                const authType      = mode === 'quick-toggle' ? otherType : saved.authType;
                const baseUrl       = authType === 'ldap' ? LDAP_BASE_URL : savedBaseUrl;
                const newAuthConfig = { baseUrl, ...AUTH_CONFIGS[ authType ] };

                writeFileSync( AUTH_CONFIG_PATH, JSON.stringify( newAuthConfig, null, 4 ) + '\n', 'utf8' );
                config.authConfig.authType = authType;
                writeConfig( config );
                console.log( chalk.bold.green( `\n  ✔ authentication.configuration.json updated (${authType})\n` ) );

                return;
            }
        }

        // ── 1. Auth type ──────────────────────────────────────────────────────
        const authType = await select( {
            message: 'Auth type',
            choices: [
                { name: 'ldap', value: 'ldap' },
                { name: 'jwt',  value: 'jwt'  },
            ],
            default: saved.authType || 'ldap',
            loop: false,
        } );

        // ── 2. Version + Base URL (jwt only) ─────────────────────────────────
        let version = saved.version;
        let baseUrl = LDAP_BASE_URL;
        let baseUrlTemplate = saved.baseUrlTemplate;

        if ( authType === 'jwt' ) {
            version = await input( {
                message: 'Version',
                default: saved.version || undefined,
                placeholder: 'e.g. 0906',
                validate( v ) {
                    return v.trim().length > 0 ? true : 'Version is required.';
                },
            } );

            // ── 3. Base URL ───────────────────────────────────────────────────
            baseUrlTemplate = await select( {
                message: 'Base URL',
                choices: BASE_URL_TEMPLATES.map( t => {
                    const resolved = t.replace( '{version}', version.trim() );

                    return { name: resolved, value: t, short: resolved };
                } ),
                default: saved.baseUrlTemplate || BASE_URL_TEMPLATES[ 0 ],
                loop: false,
            } );

            baseUrl = baseUrlTemplate.replace( '{version}', version.trim() );
        }

        // ── 4. Preview ────────────────────────────────────────────────────────
        const newAuthConfig = {
            baseUrl,
            ...AUTH_CONFIGS[ authType ],
        };

        console.log( '' );
        console.log( chalk.dim( '  Preview:' ) );
        console.log( chalk.dim( JSON.stringify( newAuthConfig, null, 2 ).replace( /^/gm, '  ' ) ) );
        console.log( '' );

        const ok = await confirm( { message: 'Write to authentication.configuration.json?', default: true } );
        if ( !ok ) return;

        // ── 5. Write auth file ────────────────────────────────────────────────
        writeFileSync( AUTH_CONFIG_PATH, JSON.stringify( newAuthConfig, null, 4 ) + '\n', 'utf8' );

        // ── 6. Persist config ─────────────────────────────────────────────────
        config.authConfig = { version: version.trim(), authType, baseUrlTemplate };
        writeConfig( config );

        console.log( chalk.bold.green( '\n  ✔ authentication.configuration.json updated\n' ) );
    },
};
