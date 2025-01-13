import { RateLimiterMemory } from 'rate-limiter-flexible';
import EventEmitter from 'events';

interface SearchQueueItem {
    id: string;
    query: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    results?: any[];
    error?: string;
    timestamp: number;
    retryCount: number;
}

interface QueueStatus {
    totalItems: number;
    completed: number;
    pending: number;
    failed: number;
    currentItem?: SearchQueueItem;
}

export class SearchQueue extends EventEmitter {
    private queue: SearchQueueItem[] = [];
    private inProgress: boolean = false;
    private rateLimiter: RateLimiterMemory;

    constructor() {
        super();
        // Allow 1 request per 2 seconds with burst of 3
        this.rateLimiter = new RateLimiterMemory({
            points: 3,
            duration: 6,
        });
    }

    public async addSearch(query: string): Promise<string> {
        const id = `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const item: SearchQueueItem = {
            id,
            query,
            status: 'pending',
            timestamp: Date.now(),
            retryCount: 0
        };
        
        this.queue.push(item);
        this.emit('itemAdded', item);
        
        if (!this.inProgress) {
            this.processQueue();
        }
        
        return id;
    }

    public async addBatchSearch(queries: string[]): Promise<string[]> {
        return Promise.all(queries.map(query => this.addSearch(query)));
    }

    public getStatus(): QueueStatus {
        const completed = this.queue.filter(item => item.status === 'completed').length;
        const pending = this.queue.filter(item => item.status === 'pending').length;
        const failed = this.queue.filter(item => item.status === 'failed').length;
        const currentItem = this.queue.find(item => item.status === 'in_progress');

        return {
            totalItems: this.queue.length,
            completed,
            pending,
            failed,
            currentItem
        };
    }

    public cancelSearch(id: string): boolean {
        const index = this.queue.findIndex(item => item.id === id && item.status === 'pending');
        if (index !== -1) {
            this.queue[index].status = 'failed';
            this.queue[index].error = 'Cancelled by user';
            this.emit('itemCancelled', this.queue[index]);
            return true;
        }
        return false;
    }

    private async processQueue(): Promise<void> {
        if (this.inProgress || this.queue.length === 0) {
            return;
        }

        this.inProgress = true;

        while (this.queue.some(item => item.status === 'pending')) {
            try {
                await this.rateLimiter.consume('search', 1);
                
                const item = this.queue.find(item => item.status === 'pending');
                if (!item) continue;

                item.status = 'in_progress';
                this.emit('itemStarted', item);

                try {
                    // Perform the search - this will be implemented in the browser class
                    // const results = await this.browser.search(item.query);
                    // item.results = results;
                    item.status = 'completed';
                    this.emit('itemCompleted', item);
                } catch (error) {
                    if (item.retryCount < 3) {
                        item.retryCount++;
                        item.status = 'pending';
                        this.emit('itemRetrying', item);
                        // Add exponential backoff delay
                        await new Promise(resolve => setTimeout(resolve, Math.pow(2, item.retryCount) * 1000));
                    } else {
                        item.status = 'failed';
                        item.error = error instanceof Error ? error.message : 'Unknown error occurred';
                        this.emit('itemFailed', item);
                    }
                }
            } catch (error) {
                // Rate limiter error - wait and try again
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        this.inProgress = false;
        this.emit('queueCompleted', this.getStatus());
    }

    public clearCompleted(): void {
        this.queue = this.queue.filter(item => 
            item.status !== 'completed' && item.status !== 'failed'
        );
        this.emit('queueUpdated', this.getStatus());
    }
}