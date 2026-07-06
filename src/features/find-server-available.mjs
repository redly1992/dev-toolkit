import { checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import { execa } from 'execa';
import { readConfig, writeConfig } from '../utils/config.mjs';

const BASE_URL_TEMPLATES = [
    'http://prod-{version}-epicnl.gui.stack02.cloud.able.nv:8080',
    'http://nn-{version}-epic.envmgt.stack02.cloud.able.nv:8080',
    'http://ach-{version}-epic.envmgt.stack02.cloud.able.nv:8080',
    'http://ing-{version}-epic.envmgt.stack02.cloud.able.nv:8080',
    'http://aab-{version}-epic.envmgt.stack02.cloud.able.nv:8081',
];

const ENDPOINT_PATH = '/general/entity';
const REQUEST_TIMEOUT_SECONDS = 5;
const RETRY_DELAY_MIN_MS = 1000;
const RETRY_DELAY_MAX_MS = 2000;

function createHeaders( endpoint ) {
    const baseUrl = endpoint.replace( ENDPOINT_PATH, '' );
    return {
        Accept: 'application/vnd.+json,application/vnd.v2+json',
        'Accept-Language': 'en-US,en;q=0.9',
        Authorization: 'Bearer',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'application/json;charset=utf-8',
        Pragma: 'no-cache',
        Referer: `${baseUrl}/login?from=%2Fhome`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    };
}

async function checkEndpoint( endpoint ) {
    const headers = createHeaders( endpoint );
    const args = [
        endpoint,
        '-H', `Accept: ${headers.Accept}`,
        '-H', `Accept-Language: ${headers[ 'Accept-Language' ]}`,
        '-H', `Authorization: ${headers.Authorization}`,
        '-H', `Cache-Control: ${headers[ 'Cache-Control' ]}`,
        '-H', `Connection: ${headers.Connection}`,
        '-H', `Content-Type: ${headers[ 'Content-Type' ]}`,
        '-H', `Pragma: ${headers.Pragma}`,
        '-H', `Referer: ${headers.Referer}`,
        '-H', `User-Agent: ${headers[ 'User-Agent' ]}`,
        '--insecure',
        '--silent',
        '--show-error',
        '--output', '/dev/null',
        '--write-out', '%{http_code}',
        '--max-time', `${REQUEST_TIMEOUT_SECONDS}`,
    ];

    try {
        const result = await execa( 'curl', args );
        const statusCode = Number( result.stdout.trim() ) || 0;
        return { endpoint, ok: statusCode > 0, status: statusCode };
    } catch ( error ) {
        const output = `${error?.stdout ?? ''}`.trim();
        const statusCode = Number( output ) || 0;
        return { endpoint, ok: statusCode > 0, status: statusCode };
    }
}

function randomRetryDelayMs() {
    return Math.floor( Math.random() * ( RETRY_DELAY_MAX_MS - RETRY_DELAY_MIN_MS + 1 ) ) + RETRY_DELAY_MIN_MS;
}

function sleep( ms ) {
    return new Promise( resolve => setTimeout( resolve, ms ) );
}

async function checkEndpointWithRetry( endpoint ) {
    const first = await checkEndpoint( endpoint );
    if ( first.ok ) return { ...first, attempts: 1, retried: false };

    const delay = randomRetryDelayMs();
    await sleep( delay );

    const second = await checkEndpoint( endpoint );
    return {
        ...second,
        attempts: 2,
        retried: true,
        recovered: second.ok,
    };
}

/** @type {import('../index.mjs').Feature} */
export default {
    name: 'Find Server Available',
    description: 'Check availability for version/baseUrl combinations',

    async run() {
        const config = readConfig();
        const auth = config.authConfig ?? {};
        const versions = Array.from( new Set( [
            ...( auth.recentVersions ?? [] ),
            ...( auth.version ? [ auth.version ] : [] ),
        ] ) );

        if ( versions.length === 0 ) {
            console.log( chalk.yellow( '\n  No JWT versions found. Set version in Auth Config first.\n' ) );
            return;
        }

        if ( !config.serverCheck ) {
            config.serverCheck = {
                selectedVersions: [],
                selectedTemplates: [],
            };
        }

        const selectedVersions = await checkbox( {
            message: 'Select JWT versions',
            choices: versions.map( version => ( {
                name: version,
                value: version,
                checked: ( config.serverCheck.selectedVersions ?? [] ).includes( version ),
            } ) ),
            loop: false,
            validate( answers ) {
                if ( answers.length === 0 ) return 'Select at least one version.';
                return true;
            },
        } );

        const selectedTemplates = await checkbox( {
            message: 'Select base URLs',
            choices: BASE_URL_TEMPLATES.map( template => ( {
                name: template,
                value: template,
                checked: ( config.serverCheck.selectedTemplates ?? [] ).includes( template ),
            } ) ),
            loop: false,
            validate( answers ) {
                if ( answers.length === 0 ) return 'Select at least one base URL.';
                return true;
            },
        } );

        config.serverCheck.selectedVersions = selectedVersions;
        config.serverCheck.selectedTemplates = selectedTemplates;
        writeConfig( config );

        const endpoints = [];
        for ( const version of selectedVersions ) {
            for ( const template of selectedTemplates ) {
                endpoints.push( `${template.replace( '{version}', version )}${ENDPOINT_PATH}` );
            }
        }

        console.log( chalk.dim( `\n  Checking ${endpoints.length} endpoints...\n` ) );

        const results = await Promise.all( endpoints.map( checkEndpointWithRetry ) );
        const ok = results.filter( result => result.ok );
        const failed = results.filter( result => !result.ok );
        const retried = results.filter( result => result.retried );
        const recovered = results.filter( result => result.recovered );

        console.log( chalk.bold( `  Available: ${ok.length}/${results.length}` ) );
        console.log( chalk.dim( `  Retried: ${retried.length}  ·  Recovered after retry: ${recovered.length}` ) );

        if ( failed.length > 0 ) {
            console.log( '' );
            console.log( chalk.red( `  Unavailable endpoints (${failed.length}):` ) );
            for ( const result of failed ) {
                const status = result.status > 0 ? `HTTP ${result.status}` : 'UNREACHABLE';
                console.log( chalk.red( `  ✖ ${result.endpoint}  [${status}]` ) );
            }
        }
        console.log( '' );
    },
};
