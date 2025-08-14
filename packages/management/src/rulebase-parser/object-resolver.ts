/**
 * Object resolver - maps UIDs to detailed object information
 */

export class ObjectResolver {
    private objects: Map<string, any>;
    
    constructor(objectsDictionary: any[]) {
        this.objects = new Map();
        
        // Build the UID to object mapping
        objectsDictionary.forEach(obj => {
            this.objects.set(obj.uid, obj);
        });
    }
    
    /**
     * Resolve a UID to a detailed object with formatted parameters
     */
    resolve(uid: string) {
        const obj = this.objects.get(uid);
        if (!obj) {
            return {
                uid,
                name: `Unknown (${uid})`,
                type: 'unknown',
                params: ''
            };
        }
        
        return {
            uid: obj.uid,
            name: obj.name,
            type: obj.type,
            params: this.formatParams(obj)
        };
    }
    
    /**
     * Resolve multiple UIDs
     */
    resolveMultiple(uids: string | string[]) {
        if (!Array.isArray(uids)) {
            return [this.resolve(uids)];
        }
        return uids.map(uid => this.resolve(uid));
    }
    
    /**
     * Format object parameters based on type
     */
    formatParams(obj: any): string {
        switch (obj.type) {
            case 'host':
                return obj['ipv4-address'] || '';
                
            case 'network':
                if (obj.subnet4 && obj['mask-length4']) {
                    return `${obj.subnet4}/${obj['mask-length4']}`;
                }
                return obj['subnet-mask'] ? `mask: ${obj['subnet-mask']}` : '';
                
            case 'service-tcp':
            case 'service-udp':
                return obj.port ? `port: ${obj.port}` : '';
                
            case 'service-icmp':
                return 'ICMP';
                
            case 'service-group':
                return 'group';
                
            case 'group':
                return 'group';
                
            case 'access-role':
                return 'access-role';
                
            case 'application-site':
                return 'application';
                
            case 'simple-gateway':
                return 'gateway';
                
            case 'security-zone':
                return 'zone';
                
            case 'access-layer':
                return 'layer';
                
            case 'time':
                return 'time-object';
                
            case 'CpmiAnyObject':
                return 'any';
                
            case 'Internet':
                return 'internet';
                
            case 'RulebaseAction':
                return '';
                
            default:
                return obj.type || '';
        }
    }
    
    /**
     * Get a short display string for an object
     */
    getDisplayString(uid: string): string {
        const obj = this.resolve(uid);
        const params = obj.params ? ` (${obj.params})` : '';
        return `${obj.name}${params}`;
    }
    
    /**
     * Get a detailed display string with type
     */
    getDetailedString(uid: string): string {
        const obj = this.resolve(uid);
        const type = obj.type !== 'unknown' ? ` [${obj.type}]` : '';
        const params = obj.params ? ` (${obj.params})` : '';
        return `${obj.name}${type}${params}`;
    }
}
