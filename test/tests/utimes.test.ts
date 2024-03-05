import { ErrorCode } from '../../src/ApiError';
import { backends, fs, configure, fixturesDir } from '../common';
import * as path from 'path';

describe.each(backends)('%s utimes', (name, options) => {
	const configured = configure(options);

	const filename = path.join(fixturesDir, 'x.txt');

	function expect_ok(resource: string | number, atime: Date | number, mtime: Date | number) {
		const stats = typeof resource == 'string' ? fs.statSync(resource) : fs.fstatSync(resource);
		// check up to single-second precision since sub-second precision is OS and fs dependent
		expect(fs._toUnixTimestamp(atime)).toEqual(fs._toUnixTimestamp(stats.atime));
		expect(fs._toUnixTimestamp(mtime)).toEqual(fs._toUnixTimestamp(stats.mtime));
	}

	async function runTest(atime: Date | number, mtime: Date | number): Promise<void> {
		await configured;

		await fs.promises.utimes(filename, atime, mtime);
		expect_ok(filename, atime, mtime);

		await fs.promises.utimes('foobarbaz', atime, mtime).catch(err => {
			expect(err.code).toEqual(ErrorCode.ENOENT);
		});

		// don't close this fd
		const handle = await fs.promises.open(filename, 'r');

		await fs.promises.futimes(handle, atime, mtime);
		expect_ok(handle.fd, atime, mtime);

		fs.futimes(-1, atime, mtime, err => {
			expect(err.code).toEqual(ErrorCode.EBADF);
		});

		if (!fs.getMount('/').metadata.synchronous) {
			return;
		}

		fs.utimesSync(filename, atime, mtime);
		expect_ok(filename, atime, mtime);

		// some systems don't have futimes
		// if there's an error, it should be ENOSYS
		try {
			fs.futimesSync(handle.fd, atime, mtime);
			expect_ok(handle.fd, atime, mtime);
		} catch (err) {
			expect(err.code).toEqual(ErrorCode.ENOTSUP);
		}

		try {
			fs.utimesSync('foobarbaz', atime, mtime);
		} catch (err) {
			expect(err.code).toEqual(ErrorCode.ENOENT);
		}

		try {
			fs.futimesSync(-1, atime, mtime);
		} catch (err) {
			expect(err.code).toEqual(ErrorCode.EBADF);
		}
	}

	it('utimes should work', async () => {
		await configured;
		await runTest(new Date('1982/09/10 13:37:00'), new Date('1982/09/10 13:37:00'));
		await runTest(new Date(), new Date());
		await runTest(123456.789, 123456.789);
		const stats = fs.statSync(filename);
		await runTest(stats.atime, stats.mtime);
	});
});
