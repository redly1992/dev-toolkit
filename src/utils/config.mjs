import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const CONFIG_PATH = resolve( dirname( fileURLToPath( import.meta.url ) ), '../../toolkit.config.json' );

const DEFAULT_CONFIG = {
    version: '1',
    focusServe: {
        modules: [
            'account-management', 'advisor', 'authorisation', 'backoffice',
            'configuration', 'corporate-actions', 'fee-charge', 'generic-interface',
            'helper', 'home', 'infront', 'instrument', 'legal-reporting', 'margin',
            'midoffice', 'order', 'payments', 'pension', 'performance-reportings',
            'private-banking', 'recon', 'settings', 'settlement', 'transaction', 'wealth',
        ].map( name => ( { name, selected: false } ) ),
    },
    createBranch: {
        baseBranch: '',
    },
    authConfig: {
        version: '',
        authType: 'ldap',
        baseUrlTemplate: 'http://prod-{version}-epicnl.gui.stack02.cloud.able.nv:8080',
    },
    focusTest: {
        recent: [],
        browserMode: 'headless',
    },
    recentFeatures: [],
};

export function readConfig() {
    if ( !existsSync( CONFIG_PATH ) ) {
        writeFileSync( CONFIG_PATH, JSON.stringify( DEFAULT_CONFIG, null, 2 ) + '\n', 'utf8' );
    }

    return JSON.parse( readFileSync( CONFIG_PATH, 'utf8' ) );
}

export function writeConfig( config ) {
    writeFileSync( CONFIG_PATH, JSON.stringify( config, null, 2 ) + '\n', 'utf8' );
}
