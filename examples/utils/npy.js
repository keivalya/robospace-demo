class npyjs {

    constructor(opts) {
        if (opts) {
            console.error([
                "No arguments accepted to npyjs constructor.",
                "For usage, go to https://github.com/jhuapl-boss/npyjs."
            ].join(" "));
        }

        this.dtypes = {
            "<u1": {
                name: "uint8",
                size: 8,
                arrayConstructor: Uint8Array,
            },
            "|u1": {
                name: "uint8",
                size: 8,
                arrayConstructor: Uint8Array,
            },
            "<u2": {
                name: "uint16",
                size: 16,
                arrayConstructor: Uint16Array,
            },
            "|i1": {
                name: "int8",
                size: 8,
                arrayConstructor: Int8Array,
            },
            "<i2": {
                name: "int16",
                size: 16,
                arrayConstructor: Int16Array,
            },
            "<u4": {
                name: "uint32",
                size: 32,
                arrayConstructor: Uint32Array,
            },
            "<i4": {
                name: "int32",
                size: 32,
                arrayConstructor: Int32Array,
            },
            "<u8": {
                name: "uint64",
                size: 64,
                arrayConstructor: BigUint64Array,
            },
            "<i8": {
                name: "int64",
                size: 64,
                arrayConstructor: BigInt64Array,
            },
            "<f4": {
                name: "float32",
                size: 32,
                arrayConstructor: Float32Array
            },
            "<f8": {
                name: "float64",
                size: 64,
                arrayConstructor: Float64Array
            },
            ">u1": {
                name: "uint8",
                size: 8,
                arrayConstructor: Uint8Array,
            },
            ">u2": {
                name: "uint16",
                size: 16,
                arrayConstructor: Uint16Array,
            },
            ">i1": {
                name: "int8",
                size: 8,
                arrayConstructor: Int8Array,
            },
            ">i2": {
                name: "int16",
                size: 16,
                arrayConstructor: Int16Array,
            },
            ">u4": {
                name: "uint32",
                size: 32,
                arrayConstructor: Uint32Array,
            },
            ">i4": {
                name: "int32",
                size: 32,
                arrayConstructor: Int32Array,
            },
            ">u8": {
                name: "uint64",
                size: 64,
                arrayConstructor: BigUint64Array,
            },
            ">i8": {
                name: "int64",
                size: 64,
                arrayConstructor: BigInt64Array,
            },
            ">f4": {
                name: "float32",
                size: 32,
                arrayConstructor: Float32Array
            },
            ">f8": {
                name: "float64",
                size: 64,
                arrayConstructor: Float64Array
            }
        };
    }

    parse(arrayBufferContents) {
        // Check magic number
        const magic = new Uint8Array(arrayBufferContents, 0, 6);
        const magicString = String.fromCharCode(...magic);
        if (magicString !== '\x93NUMPY') {
            throw new Error('Invalid NPY file: missing magic number');
        }

        // Version
        const version = new Uint8Array(arrayBufferContents, 6, 2);
        const versionMajor = version[0];
        const versionMinor = version[1];

        let headerLength;
        let offsetBytes;

        if (versionMajor === 1 && versionMinor === 0) {
            // NPY version 1.0
            const dv = new DataView(arrayBufferContents, 8, 2);
            headerLength = dv.getUint16(0, true); // little-endian
            offsetBytes = 10 + headerLength;
        } else if (versionMajor === 2 && versionMinor === 0) {
            // NPY version 2.0
            const dv = new DataView(arrayBufferContents, 8, 4);
            headerLength = dv.getUint32(0, true); // little-endian
            offsetBytes = 12 + headerLength;
        } else if (versionMajor === 3 && versionMinor === 0) {
            // NPY version 3.0 (same as 2.0 for header)
            const dv = new DataView(arrayBufferContents, 8, 4);
            headerLength = dv.getUint32(0, true); // little-endian
            offsetBytes = 12 + headerLength;
        } else {
            throw new Error(`Unsupported NPY version: ${versionMajor}.${versionMinor}`);
        }

        // Parse header
        const headerStart = versionMajor === 1 ? 10 : 12;
        const headerBytes = new Uint8Array(arrayBufferContents, headerStart, headerLength);
        let headerStr = new TextDecoder("utf-8").decode(headerBytes);
        
        // Clean up header string
        headerStr = headerStr.trim();
        if (headerStr.endsWith('\n')) {
            headerStr = headerStr.slice(0, -1).trim();
        }
        
        // Log raw header for debugging
        console.log("NPY header:", headerStr);
        
        // Convert Python dict to JSON
        let jsonHeader = headerStr
            .replace(/'/g, '"')
            .replace(/True/g, 'true')
            .replace(/False/g, 'false')
            .replace(/\(/g, '[')
            .replace(/\)/g, ']')
            .replace(/,\s*}/, '}')
            .replace(/,\s*\]/, ']');
        
        // Parse JSON
        let header;
        try {
            header = JSON.parse(jsonHeader);
        } catch (e) {
            console.error("Failed to parse header:", jsonHeader);
            throw e;
        }
        
        const { descr, fortran_order, shape } = header;
        
        // Get dtype info
        const dtype = this.dtypes[descr];
        if (!dtype) {
            throw new Error(`Unsupported dtype: ${descr}`);
        }
        
        // Calculate expected size
        const numElements = shape.reduce((a, b) => a * b, 1);
        const expectedBytes = numElements * (dtype.size / 8);
        
        // Read data
        const data = new dtype.arrayConstructor(
            arrayBufferContents,
            offsetBytes,
            numElements
        );
        
        return {
            dtype: dtype.name,
            data: data,
            shape: shape,
            fortranOrder: fortran_order
        };
    }

    async load(filename, callback, fetchArgs) {
        console.log(`Loading: ${filename}`);
        
        try {
            fetchArgs = fetchArgs || {};
            const response = await fetch(filename, fetchArgs);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const result = this.parse(arrayBuffer);
            
            if (callback) {
                return callback(result);
            }
            return result;
        } catch (error) {
            console.error(`Error loading ${filename}:`, error);
            throw error;
        }
    }
}

export default npyjs;