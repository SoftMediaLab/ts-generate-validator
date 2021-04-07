import { equalValidator, equalToValidator } from './../../src/validators/common';
import { requiredOneOfValidator, typeValidator, ValidationType } from '../../src';
import { getConfig } from './../../src/config/runtime';

const testData = {
  a: 24,
  b: 'test',
  c: undefined,
  d: null,
  e: 24,
  f: 5,
  g: {
    a: 1,
    b: 2
  }
};

describe('common validators', () => {
  const config = getConfig();
  const propertyName = 'a';
  const nullPropertyName = 'd';
  const equalPropertyName = 'e';
  const notEqualPropertyName = 'b';

  // requiredOneOfValidator
  test('requiredOneOfValidator validator', () => {
    expect(
      jest.fn(() => {
        requiredOneOfValidator({
          property: testData.c,
          fields: ['c', 'd', 'm', 'l', 'z'],
          config,
          data: testData,
          propertyName
        });
      })
    ).toThrowError();

    expect(
      jest.fn(() => {
        requiredOneOfValidator({
          property: testData.c,
          fields: ['c', 'c', 'd', 'd'],
          config,
          data: testData,
          propertyName
        });
      })
    ).toThrowError();

    expect(
      jest.fn(() => {
        requiredOneOfValidator({
          property: testData.a,
          fields: ['a', 'b', 'e'],
          config,
          data: testData,
          propertyName
        });
      })
    ).not.toThrowError();
  });

  test('type validator', () => {
    expect(
      jest.fn(() => {
        typeValidator({
          property: testData[nullPropertyName],
          type: ValidationType.null,
          config,
          data: testData,
          propertyName: nullPropertyName
        });
      })
    ).not.toThrowError();

    expect(
      jest.fn(() => {
        typeValidator({
          property: testData[propertyName],
          type: ValidationType.null,
          config,
          data: testData,
          propertyName: propertyName
        });
      })
    ).toThrowError();

    expect(
      jest.fn(() => {
        typeValidator({
          property: testData[propertyName],
          type: ValidationType.unknown,
          config,
          data: testData,
          propertyName
        });
      })
    ).toThrowError();

    expect(
      jest.fn(() => {
        typeValidator({
          property: testData[propertyName],
          type: ValidationType.string,
          config,
          data: testData,
          propertyName
        });
      })
    ).toThrowError();

    expect(
      jest.fn(() => {
        typeValidator({
          property: testData[propertyName],
          type: ValidationType.number,
          config,
          data: testData,
          propertyName
        });
        return true;
      })
    ).not.toThrowError();
  });

  test('equal validator', () => {
    expect(
      jest.fn(() => {
        equalValidator({
          property: testData[propertyName],
          value: testData[notEqualPropertyName],
          config,
          data: testData,
          propertyName
        });
      })
    ).toThrowError();

    expect(
      jest.fn(() => {
        equalValidator({
          property: testData[propertyName],
          value: testData[propertyName],
          config,
          data: testData,
          propertyName
        });
        return true;
      })
    ).not.toThrowError();
  });

  test('equalTo validator', () => {
    expect(
      jest.fn(() => {
        equalToValidator({
          property: testData[propertyName],
          targetPropertyName: notEqualPropertyName,
          config,
          data: testData,
          propertyName
        });
      })
    ).toThrowError();

    expect(
      jest.fn(() => {
        equalToValidator({
          property: testData[propertyName],
          targetPropertyName: equalPropertyName,
          config,
          data: testData,
          propertyName
        });
        return true;
      })
    ).not.toThrowError();
  });
});
