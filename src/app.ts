import * as core from '@actions/core';

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
async function run(): Promise<void> {
    try {
        const beetsToDistribute: string = core.getInput('beets_to_distribute');

        core.debug(`DGB: Distributing ${beetsToDistribute} BEETS next epoch`);
        console.log(`LOG: Distributing ${beetsToDistribute} BEETS next epoch`);
        console.log(`LOG-PROCESS: Distributing ${process.env.BEETS_TO_DISTRIBUTE} BEETS next epoch`);
    } catch (error) {
        // Fail the workflow run if an error occurs
        if (error instanceof Error) core.setFailed(error.message);
    }
}

run();
