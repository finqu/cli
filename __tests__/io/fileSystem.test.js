import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { Readable, Writable } from 'stream';
import { FileSystem, createFileSystem } from '../../src/io/fileSystem.js';

// Mock the fs module
vi.mock('fs', () => {
  // Mock implementations for read/write streams
  const MockReadStream = class extends Readable {
    constructor(options) {
      super(options);
    }
    _read() {} // Required implementation
  };

  const MockWriteStream = class extends Writable {
    constructor(options) {
      super(options);
    }
    _write(chunk, encoding, callback) {
      callback();
    }
  };

  return {
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      readdir: vi.fn(),
      stat: vi.fn(),
      unlink: vi.fn(), // Add mock for unlink
    },
    existsSync: vi.fn(),
    createReadStream: vi.fn(() => new MockReadStream()),
    createWriteStream: vi.fn(() => new MockWriteStream()),
  };
});

// Import fs module after mocking
import {
  promises as fs,
  existsSync,
  createReadStream,
  createWriteStream,
} from 'fs';

describe('src/io/fileSystem.js', () => {
  let fileSystem;

  beforeEach(() => {
    fileSystem = createFileSystem();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createFileSystem()', () => {
    it('should return a FileSystem instance', () => {
      expect(fileSystem).toBeInstanceOf(FileSystem);
    });
  });

  describe('exists()', () => {
    it('should return true if file exists', async () => {
      existsSync.mockReturnValueOnce(true);

      const result = await fileSystem.exists('/path/to/file.txt');

      expect(result).toBe(true);
      expect(existsSync).toHaveBeenCalledWith('/path/to/file.txt');
    });

    it('should return false if file does not exist', async () => {
      existsSync.mockReturnValueOnce(false);

      const result = await fileSystem.exists('/path/to/nonexistent.txt');

      expect(result).toBe(false);
      expect(existsSync).toHaveBeenCalledWith('/path/to/nonexistent.txt');
    });
  });

  describe('readFile()', () => {
    it('should read a file with specified encoding', async () => {
      const expectedContent = 'file content';
      fs.readFile.mockResolvedValueOnce(expectedContent);

      const result = await fileSystem.readFile('/path/to/file.txt', 'utf-8');

      expect(result).toBe(expectedContent);
      expect(fs.readFile).toHaveBeenCalledWith('/path/to/file.txt', 'utf-8');
    });

    it('should read a file as buffer if no encoding specified', async () => {
      const buffer = Buffer.from('file content');
      fs.readFile.mockResolvedValueOnce(buffer);

      const result = await fileSystem.readFile('/path/to/file.txt');

      expect(result).toBe(buffer);
      expect(fs.readFile).toHaveBeenCalledWith('/path/to/file.txt', undefined);
    });

    it('should propagate errors when reading fails', async () => {
      const error = new Error('File not found');
      fs.readFile.mockRejectedValueOnce(error);

      await expect(
        fileSystem.readFile('/path/to/nonexistent.txt', 'utf-8'),
      ).rejects.toThrow('File not found');
      expect(fs.readFile).toHaveBeenCalledWith(
        '/path/to/nonexistent.txt',
        'utf-8',
      );
    });
  });

  describe('writeFile()', () => {
    it('should write data to a file', async () => {
      fs.writeFile.mockResolvedValueOnce(undefined);

      await fileSystem.writeFile('/path/to/file.txt', 'file content');

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/path/to/file.txt',
        'file content',
      );
    });

    it('should write buffer data to a file', async () => {
      const buffer = Buffer.from('buffer content');
      fs.writeFile.mockResolvedValueOnce(undefined);

      await fileSystem.writeFile('/path/to/file.txt', buffer);

      expect(fs.writeFile).toHaveBeenCalledWith('/path/to/file.txt', buffer);
    });

    it('should propagate errors when writing fails', async () => {
      const error = new Error('Cannot write to file');
      fs.writeFile.mockRejectedValueOnce(error);

      await expect(
        fileSystem.writeFile('/path/to/file.txt', 'content'),
      ).rejects.toThrow('Cannot write to file');
      expect(fs.writeFile).toHaveBeenCalledWith('/path/to/file.txt', 'content');
    });
  });

  describe('mkdir()', () => {
    it('should create a directory', async () => {
      fs.mkdir.mockResolvedValueOnce(undefined);

      await fileSystem.mkdir('/path/to/directory');

      expect(fs.mkdir).toHaveBeenCalledWith('/path/to/directory', undefined);
    });

    it('should create a directory with options', async () => {
      const options = { recursive: true };
      fs.mkdir.mockResolvedValueOnce(undefined);

      await fileSystem.mkdir('/path/to/directory', options);

      expect(fs.mkdir).toHaveBeenCalledWith('/path/to/directory', options);
    });

    it('should propagate errors when directory creation fails', async () => {
      const error = new Error('Cannot create directory');
      fs.mkdir.mockRejectedValueOnce(error);

      await expect(fileSystem.mkdir('/path/to/directory')).rejects.toThrow(
        'Cannot create directory',
      );
      expect(fs.mkdir).toHaveBeenCalledWith('/path/to/directory', undefined);
    });
  });

  describe('readdir()', () => {
    it('should list directory contents', async () => {
      const contents = ['file1.txt', 'file2.txt', 'subdirectory'];
      fs.readdir.mockResolvedValueOnce(contents);

      const result = await fileSystem.readdir('/path/to/directory');

      expect(result).toEqual(contents);
      expect(fs.readdir).toHaveBeenCalledWith('/path/to/directory', undefined);
    });

    it('should list directory contents with options', async () => {
      const options = { withFileTypes: true };
      const mockDirents = [
        { name: 'file1.txt', isDirectory: () => false },
        { name: 'subdirectory', isDirectory: () => true },
      ];
      fs.readdir.mockResolvedValueOnce(mockDirents);

      const result = await fileSystem.readdir('/path/to/directory', options);

      expect(result).toEqual(mockDirents);
      expect(fs.readdir).toHaveBeenCalledWith('/path/to/directory', options);
    });

    it('should propagate errors when reading directory fails', async () => {
      const error = new Error('Directory not found');
      fs.readdir.mockRejectedValueOnce(error);

      await expect(fileSystem.readdir('/path/to/nonexistent')).rejects.toThrow(
        'Directory not found',
      );
      expect(fs.readdir).toHaveBeenCalledWith(
        '/path/to/nonexistent',
        undefined,
      );
    });
  });

  describe('stat()', () => {
    it('should return file stats', async () => {
      const mockStats = {
        size: 1024,
        isFile: () => true,
        isDirectory: () => false,
      };
      fs.stat.mockResolvedValueOnce(mockStats);

      const result = await fileSystem.stat('/path/to/file.txt');

      expect(result).toEqual(mockStats);
      expect(result.size).toBe(1024);
      expect(result.isFile()).toBe(true);
      expect(result.isDirectory()).toBe(false);
      expect(fs.stat).toHaveBeenCalledWith('/path/to/file.txt');
    });

    it('should propagate errors when stat fails', async () => {
      const error = new Error('File not found');
      fs.stat.mockRejectedValueOnce(error);

      await expect(fileSystem.stat('/path/to/nonexistent.txt')).rejects.toThrow(
        'File not found',
      );
      expect(fs.stat).toHaveBeenCalledWith('/path/to/nonexistent.txt');
    });
  });

  describe('createReadStream()', () => {
    it('should create a read stream', () => {
      const stream = fileSystem.createReadStream('/path/to/file.txt');

      expect(stream).toBeInstanceOf(Readable);
      expect(createReadStream).toHaveBeenCalledWith(
        '/path/to/file.txt',
        undefined,
      );
    });

    it('should create a read stream with options', () => {
      const options = { encoding: 'utf8', highWaterMark: 64 };
      const stream = fileSystem.createReadStream('/path/to/file.txt', options);

      expect(stream).toBeInstanceOf(Readable);
      expect(createReadStream).toHaveBeenCalledWith(
        '/path/to/file.txt',
        options,
      );
    });
  });

  describe('createWriteStream()', () => {
    it('should create a write stream', () => {
      const stream = fileSystem.createWriteStream('/path/to/file.txt');

      expect(stream).toBeInstanceOf(Writable);
      expect(createWriteStream).toHaveBeenCalledWith(
        '/path/to/file.txt',
        undefined,
      );
    });

    it('should create a write stream with options', () => {
      const options = { flags: 'a', encoding: 'utf8' };
      const stream = fileSystem.createWriteStream('/path/to/file.txt', options);

      expect(stream).toBeInstanceOf(Writable);
      expect(createWriteStream).toHaveBeenCalledWith(
        '/path/to/file.txt',
        options,
      );
    });
  });

  describe('checkPath()', () => {
    it('should return true for valid paths', () => {
      const validPaths = [
        '/path/to/file.txt',
        '/path/to/directory',
        'relative/path/file.js',
        'assets/image.png',
      ];

      validPaths.forEach((path) => {
        expect(fileSystem.checkPath(path)).toBe(true);
      });
    });

    it('should return false for hidden files and directories', () => {
      const hiddenPaths = [
        '/path/to/.hidden',
        '.gitignore',
        'path/to/.config/file',
        'C:\\Users\\user\\.hidden',
      ];

      hiddenPaths.forEach((path) => {
        expect(fileSystem.checkPath(path)).toBe(false);
      });
    });

    it('should return false for git files', () => {
      const gitPaths = ['.git/config', 'path/to/.git/objects', 'project/.git'];

      gitPaths.forEach((path) => {
        expect(fileSystem.checkPath(path)).toBe(false);
      });
    });

    it('should return false for node_modules', () => {
      const nodeModulesPaths = [
        'node_modules/package',
        '/path/to/node_modules/dependency',
        './node_modules',
      ];

      nodeModulesPaths.forEach((path) => {
        expect(fileSystem.checkPath(path)).toBe(false);
      });
    });
  });

  describe('getFiles()', () => {
    it('should recursively get all files from a directory', async () => {
      // Mock the directory structure:
      // dir/
      //  ├── file1.txt
      //  ├── file2.txt
      //  └── subdir/
      //      └── file3.txt
      const dirContents = [
        { name: 'file1.txt', isDirectory: () => false },
        { name: 'file2.txt', isDirectory: () => false },
        { name: 'subdir', isDirectory: () => true },
      ];

      const subdirContents = [{ name: 'file3.txt', isDirectory: () => false }];

      // Mock the readdir calls
      fs.readdir
        .mockResolvedValueOnce(dirContents) // First call for main dir
        .mockResolvedValueOnce(subdirContents); // Second call for subdir

      // Create spy for the recursive method call
      const getFilesSpy = vi.spyOn(fileSystem, 'getFiles');

      // Mock path.resolve to return predictable paths
      const originalResolve = path.resolve;
      path.resolve = vi
        .fn()
        .mockReturnValueOnce('/dir/file1.txt')
        .mockReturnValueOnce('/dir/file2.txt')
        .mockReturnValueOnce('/dir/subdir')
        .mockReturnValueOnce('/dir/subdir/file3.txt');

      const result = await fileSystem.getFiles('/dir');

      expect(result).toEqual([
        '/dir/file1.txt',
        '/dir/file2.txt',
        '/dir/subdir/file3.txt',
      ]);

      expect(fs.readdir).toHaveBeenCalledTimes(2);
      expect(fs.readdir).toHaveBeenNthCalledWith(1, '/dir', {
        withFileTypes: true,
      });
      expect(fs.readdir).toHaveBeenNthCalledWith(2, '/dir/subdir', {
        withFileTypes: true,
      });

      // Verify recursive call was made
      expect(getFilesSpy).toHaveBeenCalledTimes(2);
      expect(getFilesSpy).toHaveBeenNthCalledWith(1, '/dir');
      expect(getFilesSpy).toHaveBeenNthCalledWith(2, '/dir/subdir');

      // Restore path.resolve
      path.resolve = originalResolve;
      getFilesSpy.mockRestore();
    });

    it('should handle errors during directory traversal', async () => {
      // Mock an error on directory read
      const error = new Error('Permission denied');
      fs.readdir.mockRejectedValueOnce(error);

      await expect(fileSystem.getFiles('/inaccessible')).rejects.toThrow(
        'Permission denied',
      );

      expect(fs.readdir).toHaveBeenCalledWith('/inaccessible', {
        withFileTypes: true,
      });
    });
  });

  describe('validateDirectory()', () => {
    it('should validate a directory successfully', async () => {
      // Mock successful validation
      existsSync.mockReturnValue(true);
      fs.stat.mockResolvedValue({
        isDirectory: () => true,
      });
      fs.writeFile.mockResolvedValue(undefined);
      fs.unlink.mockResolvedValue(undefined);
      fs.readdir.mockResolvedValue(['file1.txt']);

      const result = await fileSystem.validateDirectory('/valid/directory');

      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
      expect(existsSync).toHaveBeenCalledWith('/valid/directory');
      expect(fs.stat).toHaveBeenCalledWith('/valid/directory');
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('/valid/directory/.finqu-write-test'),
        'test',
      );
      expect(fs.readdir).toHaveBeenCalledWith('/valid/directory', undefined);
    });

    it('should return invalid if directory does not exist', async () => {
      existsSync.mockReturnValue(false);

      const result = await fileSystem.validateDirectory('/nonexistent/dir');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Directory does not exist');
      expect(existsSync).toHaveBeenCalledWith('/nonexistent/dir');
      expect(fs.stat).not.toHaveBeenCalled();
    });

    it('should return invalid if path is not a directory', async () => {
      existsSync.mockReturnValue(true);
      fs.stat.mockResolvedValue({
        isDirectory: () => false,
      });

      const result = await fileSystem.validateDirectory('/file.txt');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Not a directory');
      expect(existsSync).toHaveBeenCalledWith('/file.txt');
      expect(fs.stat).toHaveBeenCalledWith('/file.txt');
    });

    it('should return invalid if directory is not writable', async () => {
      existsSync.mockReturnValue(true);
      fs.stat.mockResolvedValue({
        isDirectory: () => true,
      });
      fs.writeFile.mockRejectedValue(new Error('Permission denied'));

      const result = await fileSystem.validateDirectory('/readonly/dir');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not writable');
      expect(existsSync).toHaveBeenCalledWith('/readonly/dir');
      expect(fs.stat).toHaveBeenCalledWith('/readonly/dir');
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should return invalid if directory is not readable', async () => {
      existsSync.mockReturnValue(true);
      fs.stat.mockResolvedValue({
        isDirectory: () => true,
      });
      fs.writeFile.mockResolvedValue(undefined);
      fs.unlink.mockResolvedValue(undefined);
      fs.readdir.mockRejectedValue(new Error('Permission denied'));

      const result = await fileSystem.validateDirectory('/unreadable/dir');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not readable');
      expect(existsSync).toHaveBeenCalledWith('/unreadable/dir');
      expect(fs.stat).toHaveBeenCalledWith('/unreadable/dir');
      expect(fs.readdir).toHaveBeenCalledWith('/unreadable/dir', undefined);
    });

    it('should handle unexpected errors during validation', async () => {
      existsSync.mockReturnValue(true);
      fs.stat.mockRejectedValue(new Error('Unexpected error'));

      const result = await fileSystem.validateDirectory('/problematic/dir');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Error validating directory');
      expect(existsSync).toHaveBeenCalledWith('/problematic/dir');
    });
  });
});
