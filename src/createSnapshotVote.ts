import * as core from '@actions/core';
import moment from 'moment';
import * as fs from 'fs';

async function run(): Promise<void> {
    try {
        // read the vote options from the file
        // create snapshot vote
    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message);
    }
}

run();
