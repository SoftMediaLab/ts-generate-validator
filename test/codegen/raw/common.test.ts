import { readAllOutputFiles, removeGeneratedValidators } from './../../utils/output';
import { createValidators } from './../../../src/codegen/index';
import { prepareDataForRender } from './../../../src/codegen/prepare/index';
import { parseInputFiles } from '../../../src/codegen/parse/index';
import * as path from 'path';
import { getAllFiles } from '../../../src/codegen/utils/getAllFiles';
import { getCodegenConfig } from '../../../src/config/codegen';
import { deleteConfigFile, createConfigFile } from '../../utils/config';

describe('codegen/raw/common', () => {
  const prevRootDir = process.cwd();

  beforeAll(() => {
    const testRootDir = path.resolve(process.cwd(), 'test/mock/raw/common');
    process.chdir(testRootDir);
    createConfigFile({
      inputPath: '.'
    });
  });

  afterAll(() => {
    deleteConfigFile();
    process.chdir(prevRootDir);
  });

  test('parse & prepare', async () => {
    const config = getCodegenConfig();
    const inputFiles = getAllFiles(path.resolve(process.cwd(), config.inputPath));

    const inputFilesMetadata = parseInputFiles(inputFiles);
    expect(inputFilesMetadata).toMatchSnapshot('parsed metadata');

    const dataForRender = prepareDataForRender(inputFilesMetadata, config);
    expect(dataForRender).toMatchSnapshot('data for render');
  });

  test('create validators', async () => {
    await createValidators();

    readAllOutputFiles(({ file, content }) => {
      expect(content).toMatchSnapshot(`generated validators at "${file}"`);
    });

    removeGeneratedValidators();
  });
});
