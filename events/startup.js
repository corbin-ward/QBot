const admin = require('firebase-admin');
const Queue = require('../classes/Queue.js');
const moment = require('moment-timezone');

const readyUpTime = 10;

async function fetchResponse(client, channelId, messageId) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            console.warn(`Channel with ID ${channelId} not found.`);
            return null;
        }

        const response = await channel.messages.fetch(messageId);
        if (!response) {
            console.warn(`Message with ID ${messageId} not found in channel ${channelId}.`);
            return null;
        }

        return response;
    } catch (error) {
        console.error(`Error fetching response for channel ${channelId} and message ${messageId}:`, error);
        return null;
    }
}

async function loadQueueData(client) {
    const db = admin.firestore();
    
    try {
        const queuesSnapshot = await db.collection('activeQueues').get();
        
        if (queuesSnapshot.empty) {
            console.log('No active queues found in Firestore.');
            return;
        }

        for (const doc of queuesSnapshot.docs) {
            try {
                const data = doc.data();
                const response = await fetchResponse(client, data.channelId, data.messageId);

                if (!response) {
                    console.warn(`Skipping queue with ID ${doc.id} due to missing response.`);
                    continue;
                }

                // Convert stored objects to Maps
                const mainMap = new Map(Object.entries(data.main || {}));
                const waitlistMap = new Map(Object.entries(data.waitlist || {}));
                const userTimersMap = new Map(Object.entries(data.userTimers || {}));

                const queue = new Queue(doc.id, {
                    response: response,
                    creator: {
                        id: data.creatorId,
                        name: data.creatorName,
                        avatar: data.creatorAvatar
                    },
                    name: data.name,
                    start: data.start,
                    timezone: data.timezone,
                    thumbnail: data.thumbnail,
                    mainMax: data.mainMax,
                    waitlistMax: data.waitlistMax,
                    main: mainMap,
                    waitlist: waitlistMap,
                    numGuests: data.numGuests,
                    userTimers: userTimersMap,
                    ready: data.ready
                });

                client.activeQueues.set(doc.id, queue);

                // Run readyQueue function and set timers if start time has passed
                const currentTime = moment().tz(queue.timezone).unix();

                if(queue.ready) {
                    console.log(`Queue is readying`);
                    await queue.readyQueue();
                    for (const [userId, timerData] of queue.userTimers.entries()) {
                        const { timeLeft } = timerData;
                        if (timeLeft > 0) {
                            await queue.setTimer(userId, timeLeft);
                        } else {
                           await queue.userTimers.delete(userId);
                        }
                    }
                } else if(currentTime >= queue.start) {
                    console.log(`Queue was collecting and is now readying`);
                    await queue.readyQueue();
                    await queue.main.forEach(user => {
                        queue.setTimer(user.id, readyUpTime * 60_000, true);
                    });
                } else {
                    console.log(`Queue is collecting`);
                    await queue.updateEmbed();
                }

                await queue.updateResponse();
                await queue.startCollector();
                console.log(`Updated response and started collector for queue ${doc.id}`);

                // Delete the queue data from Firestore after it has been loaded
                try {
                    await db.collection('activeQueues').doc(doc.id).delete();
                    console.log(`Queue with ID ${doc.id} deleted from Firebase.`);
                } catch (error) {
                    console.error(`Error deleting queue with ID ${doc.id} from Firebase:`, error);
                }
            } catch (error) {
                console.error(`Error processing queue with key ${doc.id}:`, error);
            }
        }

        console.log('Data loaded from Firebase on startup.');
    } catch (error) {
        console.error('Failed to load queue data from Firebase:', error);
    }
}

module.exports = {
    loadQueueData
};