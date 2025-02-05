import * as core from '@actions/core';
import moment from 'moment';
import * as fs from 'fs';

async function run(): Promise<void> {
    try {
        console.log(`Distributing ${process.env.BEETS_TO_DISTRIBUTE} BEETS next epoch`);

        const isoMonday = 1;

        let epochEndTimestamp = moment()
            .isoWeekday(isoMonday)
            .utc()
            .set({ hour: 19, minute: 0, second: 0, millisecond: 0 });

        if (moment().isoWeekday() > isoMonday) {
            epochEndTimestamp.add(1, 'week');
        }

        console.log(epochEndTimestamp.unix());

        const newRound = {
            beetsToDistribute: process.env.BEETS_TO_DISTRIBUTE,
        };

        fs.writeFile(`gauge-data/${epochEndTimestamp.unix()}.json`, JSON.stringify(newRound), function (err) {
            if (err) {
                throw err;
            }
        });
    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message);
    }
}

run();
