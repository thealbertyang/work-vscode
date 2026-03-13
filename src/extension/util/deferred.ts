export class Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void = () => {
    throw new Error('Deferred.resolve called before initialization');
  };
  reject: (reason?: any) => void = () => {
    throw new Error('Deferred.reject called before initialization');
  };

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}
