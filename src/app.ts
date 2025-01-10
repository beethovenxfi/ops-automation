import * as core from '@actions/core';

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
async function run(): Promise<void> {
    try {
        const beetsToDistribute: string = core.getInput('beets_to_distribute');

        core.debug(`Distributing ${beetsToDistribute} BEETS next epoch`);
    } catch (error) {
        // Fail the workflow run if an error occurs
        if (error instanceof Error) core.setFailed(error.message);
    }
}

run();
