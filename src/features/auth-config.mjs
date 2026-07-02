import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { readConfig, writeConfig } from '../utils/config.mjs';
import { WORKSPACE_ROOT } from '../utils/runner.mjs';

const AUTH_CONFIG_PATH = resolve( WORKSPACE_ROOT, 'src/authentication.configuration.json' );

const LDAP_BASE_URL = 'http://localhost:3000';
const MAX_RECENT_VERSIONS = 5;

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

async function pickJwtVersion( savedVersion, recentVersions ) {
    const ENTER_NEW = '__new__';
    const options = [
        ...recentVersions.map( version => ( {
            name:  version,
            value: version,
            short: version,
        } ) ),
        { name: chalk.dim( '↳ Enter a different version…' ), value: ENTER_NEW, short: 'New version' },
    ];

    const selected = await select( {
        message: 'JWT version',
        choices: options,
        default: savedVersion || undefined,
        loop: false,
    } );

    if ( selected !== ENTER_NEW ) return selected;

    return input( {
        message: 'JWT version',
        default: savedVersion || undefined,
        placeholder: 'e.g. 0906',
        validate( value ) {
            return value.trim().length > 0 ? true : 'Version is required.';
        },
    } );
}

/** @type {import('../index.mjs').Feature} */
export default {
    name: 'Auth Config',
    description: 'Set authentication.configuration.json (ldap / jwt)',

    async run() {
        const config = readConfig();

        if ( !config.authConfig ) {
            config.authConfig = {
                version: '',
                authType: 'ldap',
                baseUrlTemplate: BASE_URL_TEMPLATES[ 0 ],
                recentVersions: [],
            };
        }

        const saved = config.authConfig;

        if ( !saved.recentVersions ) saved.recentVersions = saved.version ? [ saved.version ] : [];

        while ( true ) {
            const mode = await select( {
                message: 'Auth mode',
                choices: [
                    { name: `Apply ldap ${chalk.dim( LDAP_BASE_URL )}`, value: 'ldap' },
                    {
                        name: `Apply jwt ${chalk.dim( saved.version ? `v${saved.version} · ${saved.baseUrlTemplate.replace( '{version}', saved.version )}` : '(set version first)' )}`,
                        value: 'jwt',
                    },
                    { name: `Configure jwt URL ${chalk.dim( saved.version ? `(v${saved.version})` : '(set version first)' )}`, value: 'jwt-url' },
                    { name: `Set jwt version ${chalk.dim( saved.version || '(not set)' )}`, value: 'set-version' },
                ],
                default: saved.authType || 'ldap',
                loop: false,
            } );

            if ( mode === 'set-version' ) {
                const pickedVersion = await pickJwtVersion( saved.version, saved.recentVersions );
                const version = pickedVersion.trim();
                config.authConfig.version = version;
                config.authConfig.recentVersions = [ version, ...saved.recentVersions.filter( v => v !== version ) ]
                    .slice( 0, MAX_RECENT_VERSIONS );
                writeConfig( config );
                saved.version = version;
                saved.recentVersions = config.authConfig.recentVersions;
                console.log( chalk.bold.green( `\n  ✔ jwt version saved (${version})\n` ) );
                continue;
            }

            let authType = mode;
            let version = saved.version;
            let baseUrlTemplate = saved.baseUrlTemplate || BASE_URL_TEMPLATES[ 0 ];
            let baseUrl = LDAP_BASE_URL;

            if ( mode === 'jwt' || mode === 'jwt-url' ) {
                if ( !version ) {
                    const pickedVersion = await pickJwtVersion( saved.version, saved.recentVersions );
                    version = pickedVersion.trim();
                    config.authConfig.version = version;
                    config.authConfig.recentVersions = [ version, ...saved.recentVersions.filter( v => v !== version ) ]
                        .slice( 0, MAX_RECENT_VERSIONS );
                }
                if ( mode === 'jwt-url' ) {
                    baseUrlTemplate = await select( {
                        message: 'Base URL',
                        choices: BASE_URL_TEMPLATES.map( template => {
                            const resolved = template.replace( '{version}', version );
                            return { name: resolved, value: template, short: resolved };
                        } ),
                        default: saved.baseUrlTemplate || BASE_URL_TEMPLATES[ 0 ],
                        loop: false,
                    } );
                }
                baseUrl = baseUrlTemplate.replace( '{version}', version );
                authType = 'jwt';
            }

            const newAuthConfig = { baseUrl, ...AUTH_CONFIGS[ authType ] };
            writeFileSync( AUTH_CONFIG_PATH, JSON.stringify( newAuthConfig, null, 4 ) + '\n', 'utf8' );
            config.authConfig = {
                ...config.authConfig,
                version: version.trim(),
                authType,
                baseUrlTemplate,
            };
            writeConfig( config );

            console.log( chalk.bold.green( `\n  ✔ authentication.configuration.json updated (${authType})\n` ) );
            return;
        }
    },
};
