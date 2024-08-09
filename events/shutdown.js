const admin = require('firebase-admin');

async function saveQueueData(client) {
    const db = admin.firestore();
    const queues = Array.from(client.activeQueues.entries());
    const batchLimit = 500; // Firestore batch limit

    function mapToObject(map) {
        const obj = {};
        for (let [key, value] of map.entries()) {
            obj[key] = value;
        }
        return obj;
    }

    // Save active queues
    try {
        for (let i = 0; i < queues.length; i += batchLimit) {
            // Slice the array to get a chunk
            const chunk = queues.slice(i, i + batchLimit);

            // Process only if the chunk is not empty
            if (chunk.length > 0) {
                const batch = db.batch();

                chunk.forEach(([key, queue]) => {
                    try {
                        // Check if queue.response exists
                        if (queue.response) {
                            const queueRef = db.collection('activeQueues').doc(key);
                            const userTimers = new Map();
                            queue.userTimers.forEach((timerData, userId) => {
                                const timeLeft = Math.max(timerData.endTime - Date.now(), 0);
                                userTimers.set(userId, { timeLeft, timerResponseId: timerData.timerResponseId, initial: timerData.initial });
                            });
                            batch.set(queueRef, {
                                channelId: queue.response.channelId || null,
                                messageId: queue.response.id || null,
                                creatorId: queue.creator.id,
                                creatorName: queue.creator.name,
                                creatorAvatar: queue.creator.avatar,
                                name: queue.name || 'Unnamed Queue',
                                start: queue.start || Date.now(),
                                timezone: queue.timezone,
                                thumbnail: queue.thumbnail,
                                mainMax: queue.mainMax || 0,
                                waitlistMax: queue.waitlistMax || 0,
                                main: mapToObject(queue.main),
                                waitlist: mapToObject(queue.waitlist),
                                numGuests: queue.numGuests || 0,
                                userTimers: mapToObject(userTimers),
                                ready: queue.ready
                            });
                        } else {
                            console.warn(`Queue with key ${key} has no response associated with it and was not saved.`);
                        }
                    } catch (error) {
                        console.error(`Error processing queue with key ${key}:`, error);
                    }
                });

                try {
                    await batch.commit();
                    console.log(`Batch ${Math.floor(i / batchLimit) + 1} saved to Firebase.`);
                } catch (error) {
                    console.error(`Error committing batch ${Math.floor(i / batchLimit) + 1}:`, error);
                }
            }
        }
        console.log('Data saved to Firebase before shutdown.');
    } catch (error) {
        console.error('Failed to save queue data:', error);
    }
}

module.exports = {
    saveQueueData
};